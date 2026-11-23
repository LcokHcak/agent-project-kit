import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { connect, exportProject, incoming, knowledge, restore, retrospective, sync } from '../scripts/handoff.mjs';

const cli = fileURLToPath(new URL('../scripts/handoff.mjs', import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
const put = (root, path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
const get = (root, path) => readFileSync(join(root, path), 'utf8');
function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), 'apk-team-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const remote = join(parent, 'team.git');
  git(parent, 'init', '--quiet', '--bare', remote);
  const [a,b] = ['甲','乙'].map(name => {
    const root = join(parent,name);
    git(parent, 'init', '--quiet', root);
    git(root, 'remote','add','team',remote);
    connect(root, 'team');
    return root;
  });
  for (const path of ['AGENTS.md','docs/BOARD.md','docs/STATUS.md']) put(a,path,'# ' + path);
  return { a,b,parent,remote };
}
const report = { title:'补传验收', result:'重复上传得到同一回执', evidence:'测试 upload-retry', lessons:'按录音标识去重，再检查回执。', next:'用更长录音复查' };

test('导出可离线读写、再导出，复盘可检索且写入可重试', t => {
  const { a,parent } = fixture(t);
  put(a,'.env','excluded'); put(a,'audio.wav','excluded');
  put(a,'.gitignore','docs/plan/private.md\n'); put(a,'docs/plan/private.md','excluded');
  retrospective(a,'T-102',report);
  retrospective(a,'T-102',report);
  assert.throws(() => retrospective(a,'T-102',{...report,result:'other'}));
  assert.throws(() => retrospective(a,'../bad',report));
  assert.throws(() => retrospective(a,'T-103',{}),/title/);
  const out = join(parent,'交接');
  exportProject(a,out);
  assert.ok(!existsSync(join(out,'.env')) && !existsSync(join(out,'audio.wav')));
  assert.ok(!existsSync(join(out,'docs/plan/private.md')));
  assert.match(get(out,'KNOWLEDGE.md'),/按录音标识去重/);
  assert.match(knowledge(out,'补传'),/T-102/);
  assert.match(knowledge(out,'天气'),/暂无/);
  assert.throws(() => exportProject(a,out));
  put(out,'docs/retros/T-102.md',get(out,'docs/retros/T-102.md').replace('按录音标识','按稳定标识'));
  const next = join(parent,'再交接');
  execFileSync(process.execPath,[join(out,'scripts/kit-handoff.mjs'),'export',next],{cwd:out});
  assert.match(get(next,'KNOWLEDGE.md'),/按稳定标识/);
  put(a,'docs/BOARD.md','原项目新增进展');
  assert.equal(restore(a,next),1);
  assert.match(knowledge(a),/按稳定标识/);
  assert.equal(get(a,'docs/BOARD.md'),'原项目新增进展');
  assert.equal(restore(a,next),0);
  put(next,'docs/BOARD.md','离线接手人同时修改');
  assert.throws(() => restore(a,next),/冲突/);
  assert.equal(get(a,'docs/BOARD.md'),'原项目新增进展');
});

test('两人双向同步，保留业务索引和分支，重复同步不创建提交', t => {
  const { a,b,remote } = fixture(t);
  put(a,'code.js','staged'); git(a,'add','code.js');
  const staged = git(a,'write-tree'), branch = git(a,'symbolic-ref','HEAD');
  const first = sync(a);
  assert.equal(sync(b),first);
  assert.equal(sync(a),first);
  put(a,'docs/STATUS.md','甲的进度'); put(b,'docs/BOARD.md','乙的任务');
  retrospective(b,'T-102',report);
  sync(a); sync(b); sync(a);
  assert.equal(get(b,'docs/STATUS.md'),'甲的进度');
  assert.equal(get(a,'docs/BOARD.md'),'乙的任务');
  assert.match(knowledge(a,'补传'),/T-102/);
  assert.equal(git(a,'write-tree'),staged); assert.equal(git(a,'symbolic-ref','HEAD'),branch);
  assert.deepEqual(git(remote,'for-each-ref','--format=%(refname)','refs/heads').split('\n'),['refs/heads/agent-project-kit-handoff']);
  assert.doesNotMatch(git(remote,'show','agent-project-kit-handoff:handoff.json'),/code\.js/);
});

test('同时编辑同一文档会停止；可查看对端并逐项解决多个冲突', t => {
  const { a,b,parent } = fixture(t);
  sync(a); sync(b);
  for (const path of ['docs/BOARD.md','docs/STATUS.md']) { put(a,path,'甲'); put(b,path,'乙'); }
  sync(a);
  let message;
  try { sync(b); } catch (err) { message = err.message; }
  const tokens = [...message.matchAll(/(docs\/\w+\.md)  ([a-f0-9]{64})/g)];
  assert.equal(tokens.length,2); assert.equal(get(b,'docs/STATUS.md'),'乙');
  const preview = join(parent,'对端'); incoming(b,preview); assert.equal(get(preview,'docs/STATUS.md'),'甲');
  assert.throws(() => sync(b,{side:'remote',token:tokens[0][2]}),/双方修改/);
  sync(b,{side:'local',token:tokens[1][2]}); sync(a);
  assert.equal(get(b,tokens[0][1]),'甲'); assert.equal(get(a,tokens[1][1]),'乙');
});

test('watch 运行中自动接收下一轮变更', { timeout: 55000 }, async t => {
  const { a,b } = fixture(t);
  sync(a);
  const child = spawn(process.execPath,[cli,'watch'],{cwd:b,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const closed = new Promise(done => child.once('close',done));
  try {
    await new Promise((done,fail) => { child.stdout.once('data',done); child.once('error',fail); child.once('exit',() => fail(Error('watch 提前退出'))); });
    assert.ok(existsSync(join(b,'docs/STATUS.md')));
    put(a,'docs/STATUS.md','对端已保存'); sync(a);
    const deadline = Date.now()+35000;
    while (get(b,'docs/STATUS.md') !== '对端已保存' && Date.now()<deadline) await new Promise(done => setTimeout(done,250));
    assert.equal(get(b,'docs/STATUS.md'),'对端已保存');
  } finally { child.kill(); await closed; }
});
