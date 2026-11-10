import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkProject, parseBoard } from '../scripts/check.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/check.mjs', import.meta.url));
const TODAY = new Date('2026-03-10T00:00:00Z');

const AGENTS = '# AGENTS.md\n\n先读 [交接单](docs/STATUS.md)。\n';
const STATUS = '# STATUS\n\n## 当前\n\n- 阶段：开发中\n\n更新于 2026-03-09，由 测试 更新。\n';
const SPEC = '# T-101 示例\n';

function board({ inProgress = [], review = [], ready = [], blocked = [], inbox = [], done = [] } = {}) {
  const table = (header, rows) => [header, header.replace(/[^|]+/g, ' --- '), ...rows].join('\n');
  return [
    '# BOARD',
    '',
    '## In progress',
    '',
    table('| 编号 | 任务 | 类型 | 谁在做 | 分支 | 说明书 |', inProgress),
    '',
    '## Review',
    '',
    table('| 编号 | 任务 | 证据 | 说明书 |', review),
    '',
    '## Ready',
    '',
    table('| 编号 | 任务 | 类型 | 可并行 | 说明书 |', ready),
    '',
    '## Blocked',
    '',
    table('| 编号 | 任务 | 卡在哪 |', blocked),
    '',
    '## Inbox',
    '',
    table('| 编号 | 想法 | 类型 | 备注 |', inbox),
    '',
    '## Done',
    '',
    table('| 编号 | 任务 | 完成日期 | 证据 |', done),
    '',
  ].join('\n');
}

function project(files) {
  const root = mkdtempSync(join(tmpdir(), 'apk-check-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

function healthy(extra = {}) {
  return {
    'AGENTS.md': AGENTS,
    'docs/STATUS.md': STATUS,
    'docs/BOARD.md': board({ ready: ['| T-101 | 示例 | 开发 | ✅ | [T-101](specs/T-101-demo.md) |'] }),
    'docs/specs/T-101-demo.md': SPEC,
    ...extra,
  };
}

function run(files, options = {}) {
  const root = project(files);
  try {
    return checkProject(root, { today: TODAY, ...options });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const messages = findings => findings.map(finding => finding.message).join('\n');

test('健康的项目没有错误也没有提醒', () => {
  const result = run(healthy());
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('缺少必需文件是错误', () => {
  const { 'docs/STATUS.md': _removed, ...files } = healthy();
  const result = run(files);
  assert.match(messages(result.errors), /docs\/STATUS\.md/);
});

test('没替换的占位符是错误', () => {
  const result = run(healthy({ 'AGENTS.md': `${AGENTS}\n{{PROJECT_ONE_LINER}}\n` }));
  assert.match(messages(result.errors), /\{\{PROJECT_ONE_LINER\}\}/);
  assert.equal(result.errors[0].file, 'AGENTS.md');
  assert.equal(result.errors[0].line, 5);
});

test('任务板上重复的编号是错误', () => {
  const result = run(healthy({
    'docs/BOARD.md': board({
      ready: ['| T-101 | 示例 | 开发 | ✅ | [T-101](specs/T-101-demo.md) |'],
      done: ['| T-101 | 示例 | 2026-03-01 | 测试通过 |'],
    }),
  }));
  assert.match(messages(result.errors), /T-101.*重复/);
});

test('Ready 的任务没有说明书是错误', () => {
  const result = run(healthy({
    'docs/BOARD.md': board({ ready: ['| T-102 | 没写说明书 | 开发 | ✅ | 待写 |'] }),
  }));
  assert.match(messages(result.errors), /T-102.*说明书/);
});

test('行里没有链接时，按文件名找到说明书也算有', () => {
  const result = run(healthy({
    'docs/BOARD.md': board({ ready: ['| T-101 | 示例 | 开发 | ✅ | 见 specs 目录 |'] }),
  }));
  assert.deepEqual(result.errors, []);
});

test('杂务不需要说明书', () => {
  const result = run(healthy({
    'docs/BOARD.md': board({
      ready: [
        '| T-001 | 首次提交（需要你本人） | 杂务 | — | 无 |',
        '| T-101 | 示例 | 开发 | ✅ | [T-101](specs/T-101-demo.md) |',
      ],
    }),
  }));
  assert.deepEqual(result.errors, []);
});

test('Blocked 和 Inbox 的任务不要求说明书', () => {
  const result = run(healthy({
    'docs/BOARD.md': board({
      ready: ['| T-101 | 示例 | 开发 | ✅ | [T-101](specs/T-101-demo.md) |'],
      blocked: ['| T-102 | 等上游 | 等 T-101 |'],
      inbox: ['| T-103 | 一个想法 | 开发 | |'],
    }),
  }));
  assert.deepEqual(result.errors, []);
});

test('断掉的相对链接是错误，并报告行号', () => {
  const result = run(healthy({ 'docs/workflow.md': '# 工作方式\n\n见 [架构](architecture.md)。\n' }));
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].file, 'docs/workflow.md');
  assert.equal(result.errors[0].line, 3);
  assert.match(result.errors[0].message, /architecture\.md/);
});

test('代码块、行内代码、外部链接和页内锚点不检查', () => {
  const content = [
    '# 笔记',
    '',
    '```md',
    '[示例](missing-in-fence.md)',
    '```',
    '',
    '行内 `[示例](missing-inline.md)`，外部 [站点](https://example.com/a.md)，[本页](#结论)，[邮件](mailto:a@example.com)。',
    '',
    '带锚点的 [交接单](STATUS.md#当前)，带行号的 [任务板](BOARD.md:3)，上一级的 [规则](../AGENTS.md)。',
    '',
  ].join('\n');
  const result = run(healthy({ 'docs/research/note.md': content.replace(/STATUS\.md|BOARD\.md/g, match => `../${match}`).replace('../AGENTS.md', '../../AGENTS.md') }));
  assert.deepEqual(result.errors, []);
});

test('带空格的路径可以用尖括号或 %20', () => {
  const result = run(healthy({
    'docs/my notes.md': '# 笔记\n',
    'docs/index.md': '[一](<my notes.md>) [二](my%20notes.md)\n',
  }));
  assert.deepEqual(result.errors, []);
});

test('交接单太久没更新是提醒', () => {
  const result = run(healthy({ 'docs/STATUS.md': STATUS.replace('2026-03-09', '2026-01-01') }));
  assert.deepEqual(result.errors, []);
  assert.match(messages(result.warnings), /2026-01-01/);
});

test('交接单没有更新日期是提醒', () => {
  const result = run(healthy({ 'docs/STATUS.md': '# STATUS\n\n## 当前\n\n- 阶段：开发中\n' }));
  assert.match(messages(result.warnings), /更新于/);
});

test('同时进行的任务超过上限是提醒', () => {
  const rows = [1, 2, 3, 4].map(n => `| T-10${n} | 任务 ${n} | 开发 | 会话 ${n} | task/T-10${n} | [说明书](specs/T-10${n}-x.md) |`);
  const specs = Object.fromEntries([1, 2, 3, 4].map(n => [`docs/specs/T-10${n}-x.md`, SPEC]));
  const result = run({ ...healthy(), ...specs, 'docs/BOARD.md': board({ inProgress: rows }) });
  assert.deepEqual(result.errors, []);
  assert.match(messages(result.warnings), /4 个.*最多 3/);
});

test('In progress 没写谁在做是提醒', () => {
  const result = run(healthy({
    'docs/BOARD.md': board({ inProgress: ['| T-101 | 示例 | 开发 |  | task/T-101 | [T-101](specs/T-101-demo.md) |'] }),
  }));
  assert.match(messages(result.warnings), /T-101.*谁在做/);
});

test('不在任务板上的说明书是提醒', () => {
  const result = run(healthy({ 'docs/specs/T-777-orphan.md': SPEC }));
  assert.match(messages(result.warnings), /T-777/);
});

test('Done 里没写证据是提醒', () => {
  const result = run(healthy({
    'docs/BOARD.md': board({
      ready: ['| T-101 | 示例 | 开发 | ✅ | [T-101](specs/T-101-demo.md) |'],
      done: ['| T-100 | 搭骨架 | 2026-03-01 |  |'],
    }),
  }));
  assert.deepEqual(result.errors, []);
  assert.match(messages(result.warnings), /T-100.*证据/);
});

test('链接的大小写和磁盘上不一致是错误（Linux 上会断）', () => {
  const result = run(healthy({ 'docs/index.md': '[交接单](status.md)\n' }));
  assert.match(messages(result.errors), /status\.md/);
});

test('AGENTS.md 太长是提醒', () => {
  const long = `${AGENTS}${'- 一条规则\n'.repeat(250)}`;
  const result = run(healthy({ 'AGENTS.md': long }));
  assert.match(messages(result.warnings), /AGENTS\.md.*行/);
});

test('parseBoard 认带后缀的编号，跳过表头和分隔行', () => {
  const sections = parseBoard(board({ blocked: ['| T-901a | 自用 | 等上游 |'] }));
  const blocked = sections.find(section => section.heading === 'Blocked');
  assert.deepEqual(blocked.header, ['编号', '任务', '卡在哪']);
  assert.equal(blocked.rows.length, 1);
  assert.equal(blocked.rows[0].id, 'T-901a');
});

test('命令行：健康时退出码 0，有错误时 1，--strict 时提醒也算失败', () => {
  const ok = project(healthy());
  const bad = project(healthy({ 'docs/workflow.md': '[坏链接](nope.md)\n' }));
  const stale = project(healthy({ 'docs/STATUS.md': STATUS.replace('2026-03-09', '2020-01-01') }));
  try {
    const exec = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.equal(exec(stale).status, 0);
    assert.equal(exec(stale, '--strict').status, 1);
    const failed = exec(bad);
    assert.equal(failed.status, 1);
    assert.match(failed.stdout, /nope\.md/);
    const json = JSON.parse(exec(bad, '--json').stdout);
    assert.equal(json.errors.length, 1);
    assert.equal(typeof exec(ok).stdout, 'string');
  } finally {
    for (const root of [ok, bad, stale]) rmSync(root, { recursive: true, force: true });
  }
});

const linkErrors = result => result.errors.filter(finding => finding.message.includes('链接')).map(finding => finding.message);

test('链接目标里成对的圆括号、标题和徽章里的图片都能认', () => {
  const body = [
    '[带括号](notes(1).md)',
    '[带标题](T-101-demo.md "标题")',
    '[![徽章](badge.svg)](T-101-demo.md)',
    '[![坏徽章](gone.svg)](also-gone.md)',
  ].join('\n');
  const result = run(healthy({ 'docs/specs/T-101-demo.md': `${SPEC}\n${body}\n`, 'docs/specs/notes(1).md': 'x\n', 'docs/specs/badge.svg': '<svg/>\n' }));
  assert.deepEqual(linkErrors(result).sort(), [
    '链接指向不存在的文件：also-gone.md（注意大小写）',
    '链接指向不存在的文件：gone.svg（注意大小写）',
  ]);
});

test('其他协议、项目外的路径和网络共享路径不检查，也不去碰它们', () => {
  const body = [
    '[a](javascript:void)', '[b](about:blank)', '[c](slack:channel)', '[d](//cdn.example.com/x.js)',
    '[e](../../../outside/nowhere.md)', '[f](\\nowhere.invalid\share\a.md)', '[g](C:\nowhere\a.md)',
    '[h](T-101-demo.md:12)', '[i](T-101-demo.md:3-9)',
  ].join('\n');
  const result = run(healthy({ 'docs/specs/T-101-demo.md': `${SPEC}\n${body}\n` }));
  assert.deepEqual(result.errors, []);
});

test('名字以两个点开头的文件仍然算项目里的文件', () => {
  const result = run(healthy({ 'AGENTS.md': `${AGENTS}\n[有](..notes.md) [没有](..gone.md)\n`, '..notes.md': 'x\n' }));
  assert.deepEqual(linkErrors(result), ['链接指向不存在的文件：..gone.md（注意大小写）']);
});

test('HTML 注释里的链接不检查，注释可以跨行', () => {
  const body = ['<!-- [a](gone.md) -->', '<!--', '[b](gone.md)', '--> [c](really-gone.md)', '行内代码里的 `<!--` 不算注释 [d](gone-too.md)'].join('\n');
  const result = run(healthy({ 'docs/specs/T-101-demo.md': `${SPEC}\n${body}\n` }));
  assert.deepEqual(linkErrors(result).sort(), [
    '链接指向不存在的文件：gone-too.md（注意大小写）',
    '链接指向不存在的文件：really-gone.md（注意大小写）',
  ]);
});

test('代码块要用同样长度的标记结束，里面带语言名的标记不算结束', () => {
  const body = ['````md', '```js', '[a](gone.md)', '```', '[b](gone.md)', '````', '[c](after.md)'].join('\n');
  const result = run(healthy({ 'docs/specs/T-101-demo.md': `${SPEC}\n${body}\n` }));
  assert.deepEqual(linkErrors(result), ['链接指向不存在的文件：after.md（注意大小写）']);
});

test('CRLF 换行和 BOM 不影响结果', () => {
  const windows = Object.fromEntries(Object.entries(healthy()).map(([path, content]) => [path, `\uFEFF${content.replace(/\n/g, '\r\n')}`]));
  assert.deepEqual(run(windows), { errors: [], warnings: [] });
  const broken = run({ ...windows, 'docs/BOARD.md': `\uFEFF${board({ ready: ['| T-102 | 没说明书 | 开发 | ✅ | |'] }).replace(/\n/g, '\r\n')}` });
  assert.equal(broken.errors.length, 1);
  assert.match(broken.errors[0].message, /T-102.*说明书/);
});

test('交接单里的日期无效时提醒，而不是悄悄通过', () => {
  const { warnings } = run(healthy({ 'docs/STATUS.md': STATUS.replace('2026-03-09', '2026-13-45') }));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /2026-13-45.*有效日期/);
});

test('命令行：写错的参数退出码 2 并说明原因，--stale-days 两种写法都认', () => {
  const stale = project(healthy({ 'docs/STATUS.md': STATUS.replace('2026-03-09', '2020-01-01') }));
  try {
    const exec = (...args) => spawnSync(process.execPath, [SCRIPT, stale, ...args], { encoding: 'utf8' });
    const typo = exec('--strcit');
    assert.equal(typo.status, 2);
    assert.match(typo.stderr, /不认识的参数 --strcit/);
    assert.equal(typo.stdout, '');
    assert.equal(exec('--stale-days', 'abc').status, 2);
    assert.equal(exec('--stale-days').status, 2);
    assert.equal(exec('another-root').status, 2);
    assert.equal(exec('--strict', '--stale-days', '99999').status, 0);
    assert.equal(exec('--strict', '--stale-days=99999').status, 0);
    assert.match(exec('--strict', '--stale-days=99999').stdout, /体检通过/);
  } finally {
    rmSync(stale, { recursive: true, force: true });
  }
});
