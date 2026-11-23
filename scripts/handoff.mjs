import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRANCH = 'refs/heads/agent-project-kit-handoff';
const REQUIRED = ['AGENTS.md', 'docs/STATUS.md', 'docs/BOARD.md'];
const FIXED = [...REQUIRED, 'docs/ROADMAP.md', 'docs/workflow.md'];
const FOLDERS = ['docs/specs', 'docs/adr', 'docs/plan', 'docs/retros', 'docs/review', 'docs/research', 'docs/experiments', 'docs/daily', 'docs/weekly', 'evals/cases', 'lab/cases'];
const LIMIT = 32 * 1024 * 1024;
const read = path => readFileSync(path, 'utf8');
const digest = text => createHash('sha256').update(text).digest('hex');
const taskId = /^[A-Z][A-Z0-9]*-\d+[a-z]?$/;

function allowed(path) {
  if (FIXED.includes(path)) return true;
  const parts = path.split('/');
  return FOLDERS.some(dir => path.startsWith(dir + '/')) && path.endsWith('.md') &&
    parts.every(part => part && !part.startsWith('.') && !/[<>:"\\|?*\x00-\x1f]/.test(part) &&
      !/[ .]$/.test(part) && !/^(con|nul|prn|aux|com[0-9]|lpt[0-9])(\.|$)/i.test(part));
}

// Apply the same path checks to incoming snapshots, local reads and writes.
function safePath(root, name) {
  if (!allowed(name)) throw Error('不支持的交接路径 ' + name);
  let path = root;
  for (const part of name.split('/')) {
    path = join(path, part);
    if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) throw Error('路径包含链接 ' + name);
  }
  return path;
}

function validate(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw Error('无效的交接文件清单');
  const names = new Set();
  for (const [name, value] of Object.entries(files)) {
    const key = name.normalize('NFC').toLowerCase();
    if (!allowed(name) || typeof value !== 'string' || names.has(key)) throw Error('无效或重复的交接路径 ' + name);
    names.add(key);
  }
  for (const name of REQUIRED) if (!Object.hasOwn(files, name)) throw Error('缺少 ' + name);
  return files;
}

function capture(root, requireProject = true) {
  const files = Object.create(null);
  const names = [];
  function add(name) {
    const path = safePath(root, name);
    if (existsSync(path)) names.push(name);
  }
  function walk(dir) {
    // Check all ancestors before traversing a directory.
    safePath(root, dir + '/index.md');
    if (!existsSync(join(root, dir))) return;
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const path = dir + '/' + entry.name;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && allowed(path)) add(path);
    }
  }
  FIXED.forEach(add);
  FOLDERS.forEach(walk);
  const excluded = ignored(root, names);
  for (const name of names) {
    if (!excluded.has(name)) files[name] = read(safePath(root, name)).replace(/\r\n/g, '\n');
  }
  return requireProject ? validate(files) : files;
}

function writeNew(root, files) {
  if (lstatSync(root, { throwIfNoEntry: false })) throw Error('导出目录已存在 ' + root);
  const staging = mkdtempSync(join(dirname(root), '.kit-export-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const path = join(staging, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, { flag: 'wx' });
    }
    renameSync(staging, root);
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true });
  }
}

function git(root, args, input) {
  return execFileSync('git', ['-C', root, ...args], {
    input, encoding: 'utf8', maxBuffer: LIMIT, timeout: 45000, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}
function head(root) {
  if (!existsSync(join(root, '.git')) && existsSync(join(root, 'HANDOFF.md'))) {
    const source = read(join(root, 'HANDOFF.md')).match(/^工作区 HEAD ([a-f0-9]{40,64})。/m);
    return source?.[1] || '未取得代码提交号';
  }
  try { return git(root, ['rev-parse', '--verify', 'HEAD']).trim(); } catch { return '未取得代码提交号'; }
}

function ignored(root, names) {
  if (!names.length || !existsSync(join(root, '.git'))) return new Set();
  try {
    const result = git(root, ['check-ignore', '--no-index', '-z', '--stdin'], names.join('\0') + '\0');
    return new Set(result.split('\0').filter(Boolean));
  } catch (err) {
    if (err.status === 1) return new Set();
    throw err;
  }
}

function lessons(files, term = '') {
  const out = [];
  for (const [name, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    if (!name.startsWith('docs/retros/') || name.endsWith('/_TEMPLATE.md')) continue;
    const section = content.split(/^## 可复用经验\s*$/m)[1]?.split(/^## /m)[0]?.trim();
    if (!section || ![name, content].join('\n').toLowerCase().includes(term.toLowerCase())) continue;
    out.push('### [' + (content.match(/^# (.+)$/m)?.[1] || name) + '](<' + name + '>)\n\n' + section);
  }
  return '# 可复用经验\n\n' + (out.join('\n\n') || '暂无匹配的经验。') + '\n';
}

function exportBase(root) {
  const text = read(join(root, 'HANDOFF.json'));
  const data = JSON.parse(text);
  if (data.version !== 1 || !data.base || typeof data.base !== 'object' || Array.isArray(data.base) ||
      !Object.entries(data.base).every(([name, hash]) => allowed(name) && /^[a-f0-9]{64}$/.test(hash)) ||
      !REQUIRED.every(name => Object.hasOwn(data.base, name))) throw Error('无效的离线交接基线');
  return data.base;
}

export function exportProject(root, destination) {
  const files = capture(root);
  const base = existsSync(join(root, 'HANDOFF.json')) ? exportBase(root)
    : Object.fromEntries(Object.entries(files).map(([name, content]) => [name, digest(content)]));
  const portable = {
    ...files, 'KNOWLEDGE.md': lessons(files),
    'HANDOFF.json': JSON.stringify({ version: 1, base }, null, 2) + '\n',
    'scripts/kit-handoff.mjs': read(fileURLToPath(import.meta.url)),
    'HANDOFF.md': '# 项目交接\n\n导出时间 ' + new Date().toISOString() +
      '\n\n工作区 HEAD ' + head(root) + '。文档包含导出时已保存的本地修改。\n\n' +
      '先读 AGENTS.md、docs/STATUS.md、docs/BOARD.md 和 KNOWLEDGE.md。继续开发时另取对应代码仓库。\n' +
      '在本目录可用 node scripts/kit-handoff.mjs knowledge 检索最新经验，修改 Markdown 后可再次导出。\n' +
      '要把离线修改交回项目，在目标项目根运行 node scripts/kit-handoff.mjs restore <交接目录>。\n' +
      '范围包括规则、交接单、任务板、路线图、工作流程、任务说明、决定、计划、调研、实验、Markdown 回归用例和复盘。引用的源码和外部附件沿原仓库查找。\n',
  };
  for (const script of ['check', 'team']) {
    const nearby = ['kit-' + script, script].map(name => new URL('./' + name + '.mjs', import.meta.url)).find(url => existsSync(url));
    if (nearby) portable['scripts/kit-' + script + '.mjs'] = read(nearby);
  }
  writeNew(destination, portable);
  return Object.keys(files).length;
}

export function restore(root, source) {
  const base = exportBase(source);
  const sourceHead = head(source);
  if (existsSync(join(root, '.git')) && /^[a-f0-9]{40,64}$/.test(sourceHead)) {
    git(root, ['merge-base', sourceHead, 'HEAD']); // Both revisions must belong to related project histories.
  }
  const bundle = capture(source);
  const local = capture(root, false);
  const excluded = ignored(root, Object.keys(bundle));
  if (excluded.size) throw Error('接手项目忽略了包内文件 ' + [...excluded].join(', '));
  const changes = [];
  const conflicts = [];
  for (const [name, content] of Object.entries(bundle)) {
    safePath(root, name);
    if (local[name] === content) continue;
    if (local[name] !== undefined && digest(content) === base[name]) continue;
    if (local[name] !== undefined && digest(local[name]) !== base[name]) conflicts.push(name);
    else changes.push(name);
  }
  if (conflicts.length) throw Error('导入有冲突，尚未写入。对照并合并这两份文件后重试：' + conflicts.join(', '));
  for (const name of changes) {
    const path = safePath(root, name);
    const current = existsSync(path) ? read(path).replace(/\r\n/g, '\n') : undefined;
    if (current !== local[name]) throw Error('导入期间文件又有修改，请重试 ' + name);
    mkdirSync(dirname(path), { recursive: true });
    replace(path, bundle[name]);
  }
  return changes.length;
}

// A separate Git history contains only the portable documents. No staging or checkout in the code repository.
function snapshot(root, oid) {
  if (!oid) return {};
  const record = JSON.parse(git(root, ['show', oid + ':handoff.json']));
  if (record.version !== 1) throw Error('无法识别的交接快照版本');
  return validate(record.files);
}

function commitSnapshot(root, files, parent) {
  const sorted = Object.fromEntries(Object.entries(validate(files)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const payload = JSON.stringify({ version: 1, files: sorted });
  if (Buffer.byteLength(payload) >= LIMIT) throw Error('交接记录超过 32 MiB，请缩小共享内容');
  const blob = git(root, ['hash-object', '-w', '--stdin'], payload).trim();
  const tree = git(root, ['mktree'], '100644 blob ' + blob + '\thandoff.json\n').trim();
  return git(root, ['-c', 'user.name=Agent Project Kit', '-c', 'user.email=kit@localhost',
    '-c', 'commit.gpgSign=false', 'commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', 'Update project handoff']).trim();
}

function endpoint(root, remote) {
  if (!/^[a-zA-Z0-9][\w.-]*$/.test(remote)) throw Error('请指定已配置的 Git remote 名称');
  const address = git(root, ['remote', 'get-url', remote]).trim();
  if (address !== git(root, ['remote', 'get-url', '--push', '--all', remote]).trim()) throw Error('协作 remote 需要唯一且一致的读写目标');
  return digest(remote + '\n' + address);
}

function newest(root, remote) {
  const line = git(root, ['ls-remote', '--heads', remote, BRANCH]).trim();
  if (!line) return '';
  git(root, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', remote, BRANCH]);
  return line.split(/\s/)[0];
}

function localState(root) {
  if (git(root, ['rev-parse', '--show-prefix']).trim()) throw Error('请在项目 Git 根目录运行');
  const dir = join(git(root, ['rev-parse', '--absolute-git-dir']).trim(), 'agent-project-kit');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function replace(path, text) {
  const temp = path + '.' + randomUUID() + '.tmp';
  writeFileSync(temp, text, { flag: 'wx' });
  try { renameSync(temp, path); } finally { if (existsSync(temp)) unlinkSync(temp); }
}

function locked(root, action) {
  const dir = localState(root);
  const lock = join(dir, 'sync.lock');
  try { writeFileSync(lock, String(process.pid), { flag: 'wx' }); }
  catch (err) {
    if (err.code !== 'EEXIST') throw err;
    throw Error('同步锁正被占用 ' + lock + '。若进程异常退出，请确认锁内 PID 已停止后再移除锁文件。');
  }
  try { return action(dir); } finally { unlinkSync(lock); }
}

function settings(root, dir) {
  const file = join(dir, 'connection.json');
  if (!existsSync(file)) throw Error('尚未设置同步目标，请先运行 connect <remote>');
  const config = JSON.parse(read(file));
  if (config.identity !== endpoint(root, config.remote)) throw Error('Git remote 地址已更换，已暂停同步');
  return config;
}

export function connect(root, remote) {
  return locked(root, dir => {
    const identity = endpoint(root, remote);
    const path = join(dir, 'connection.json');
    if (existsSync(path) && JSON.parse(read(path)).identity !== identity) throw Error('当前工作区已绑定其他同步目标');
    replace(path, JSON.stringify({ remote, identity }));
  });
}

function baseRef(identity) { return 'refs/worktree/agent-project-kit/' + identity; }
function baseline(root, identity) {
  try { return git(root, ['rev-parse', '--verify', '--quiet', baseRef(identity)]).trim(); }
  catch (e) { if (e.status === 1) return ''; throw e; }
}

export function sync(root, resolution) {
  return locked(root, dir => {
    const { remote, identity } = settings(root, dir);
    const baseOid = baseline(root, identity);
    const remoteOid = newest(root, remote);
    if (baseOid && !remoteOid) throw Error('远端交接分支消失，已暂停同步');
    if (baseOid && remoteOid !== baseOid) git(root, ['merge-base', '--is-ancestor', baseOid, remoteOid]);
    const base = snapshot(root, baseOid);
    const peer = snapshot(root, remoteOid);
    const local = capture(root, false);
    const merged = Object.create(null);
    const conflicts = [];
    let appliedResolution = false;
    for (const name of new Set([...Object.keys(peer), ...Object.keys(local), ...Object.keys(base)])) {
      const old = base[name], ours = local[name], theirs = peer[name];
      // Team records are retained. Archive retired items in their document.
      if (ours === undefined || ours === old) merged[name] = theirs ?? ours ?? old;
      else if (theirs === undefined || theirs === old || theirs === ours) merged[name] = ours;
      else {
        const token = digest(JSON.stringify([name, old ?? null, ours, theirs]));
        if (resolution?.token === token && ['local', 'remote'].includes(resolution.side)) {
          merged[name] = resolution.side === 'local' ? ours : theirs;
          appliedResolution = true;
        } else {
          conflicts.push({ name, token });
        }
      }
    }
    if (resolution && !appliedResolution) throw Error('冲突内容已变化，请重新 sync 查看当前版本');
    if (conflicts.length) {
      // Persist each explicit choice so multiple conflicts can be resolved independently.
      const choicesFile = join(dir, 'choices.json');
      const choices = existsSync(choicesFile) ? JSON.parse(read(choicesFile)) : {};
      if (appliedResolution) { choices[resolution.token] = resolution.side; replace(choicesFile, JSON.stringify(choices)); }
      const pending = conflicts.filter(({ name, token }) => {
        if (!['local', 'remote'].includes(choices[token])) return true;
        merged[name] = choices[token] === 'local' ? local[name] : peer[name];
        return false;
      });
      if (pending.length) throw Error('同一文档有双方修改；未写入项目。运行 incoming <新目录> 对照，再用 resolve local|remote <标识>。\n' +
        pending.map(c => c.name + '  ' + c.token).join('\n'));
    }
    validate(merged);
    const excluded = ignored(root, Object.keys(merged));
    if (excluded.size) throw Error('远端交接文件被本项目的 Git 忽略规则排除：' + [...excluded].join(', '));
    for (const name of Object.keys(merged)) safePath(root, name);
    const changed = Object.keys(merged).some(name => merged[name] !== peer[name]);
    let oid = remoteOid;
    if (changed) {
      oid = commitSnapshot(root, merged, remoteOid);
      // Concurrent publishers race on a regular fast-forward push. A loser retries from the new tip.
      git(root, ['-c', 'remote.' + remote + '.mirror=false', 'push', '--no-follow-tags', '--quiet', remote, oid + ':' + BRANCH]);
    }
    for (const [name, value] of Object.entries(merged)) {
      if (value === local[name]) continue;
      const path = safePath(root, name);
      const current = existsSync(path) ? read(path).replace(/\r\n/g, '\n') : undefined;
      if (current !== local[name]) throw Error('同步期间文件又有改动，保留本地内容，请重试 ' + name);
      mkdirSync(dirname(path), { recursive: true });
      replace(path, value);
    }
    git(root, ['update-ref', baseRef(identity), oid]);
    const choicesFile = join(dir, 'choices.json');
    if (existsSync(choicesFile)) unlinkSync(choicesFile);
    return oid;
  });
}

export function incoming(root, destination) {
  const { remote } = settings(root, localState(root));
  const oid = newest(root, remote);
  if (!oid) throw Error('远端尚无交接记录');
  writeNew(destination, snapshot(root, oid));
}

export function knowledge(root, search = '') { return lessons(capture(root), search); }

export function retrospective(root, id, entry) {
  if (!taskId.test(id)) throw Error('任务编号格式不正确');
  for (const field of ['title', 'result', 'evidence', 'lessons', 'next']) {
    if (typeof entry?.[field] !== 'string' || !entry[field].trim()) throw Error('复盘缺少 ' + field);
  }
  const name = 'docs/retros/' + id + '.md';
  const path = safePath(root, name);
  const content = '# ' + id + ' ' + entry.title.trim() + '\n\n' +
    [['结果与偏差', entry.result], ['验收证据', entry.evidence], ['可复用经验', entry.lessons], ['后续行动', entry.next]]
      .map(([heading, value]) => '## ' + heading + '\n\n' + value.trim()).join('\n\n') + '\n';
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && read(path).replace(/\r\n/g, '\n') === content) return name;
  writeFileSync(path, content, { flag: 'wx' });
  return name;
}

async function main(args) {
  const root = process.cwd();
  const [action, ...rest] = args;
  if (action === 'export' && rest.length === 1) return '已导出 ' + exportProject(root, resolve(rest[0])) + ' 份项目记录';
  if (action === 'restore' && rest.length === 1) return '已导入 ' + restore(root, resolve(rest[0])) + ' 份项目记录';
  if (action === 'knowledge' && rest.length <= 1) return knowledge(root, rest[0]);
  if (action === 'retro' && rest.length === 1) return retrospective(root, rest[0], JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, '')));
  if (action === 'connect' && rest.length === 1) { connect(root, rest[0]); return '已记录同步目标。运行 sync 同步一次，watch 持续同步。'; }
  if (action === 'incoming' && rest.length === 1) { incoming(root, resolve(rest[0])); return '已导出对端版本'; }
  if (action === 'sync' && !rest.length) return '同步完成 ' + sync(root);
  if (action === 'resolve' && rest.length === 2) return '同步完成 ' + sync(root, { side: rest[0], token: rest[1] });
  if (action === 'watch' && !rest.length) {
    settings(root, localState(root));
    let last = '';
    for (;;) {
      let msg;
      try { msg = '已同步 ' + sync(root); } catch (err) { msg = '待同步 ' + err.message; }
      if (msg !== last) { console.log(new Date().toISOString(), msg); last = msg; }
      await new Promise(done => setTimeout(done, 15000));
    }
  }
  throw Error('用法：handoff.mjs export <新目录> | restore <交接目录> | knowledge [关键词] | retro <任务号> (stdin JSON) | connect <remote> | sync | watch | incoming <新目录> | resolve local|remote <标识>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => console.log(result)).catch(err => { console.error(err.message); process.exitCode = 1; });
}
