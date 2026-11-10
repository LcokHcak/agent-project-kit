import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../hooks/session-start.mjs', import.meta.url));
const TODAY = new Date().toISOString().slice(0, 10);

const STATUS = `# STATUS

## 当前

- **阶段**：开发中
- **下一步**：T-101

更新于 ${TODAY}，由 测试 更新。

## 开放问题（需要人决定）

1. 用哪家云？
`;

const BOARD = `# BOARD

## In progress

| 编号 | 任务 | 类型 | 谁在做 | 分支 | 说明书 |
| --- | --- | --- | --- | --- | --- |

## Review

| 编号 | 任务 | 证据 | 说明书 |
| --- | --- | --- | --- |

## Ready

| 编号 | 任务 | 类型 | 可并行 | 说明书 |
| --- | --- | --- | --- | --- |
| T-101 | 示例任务 | 开发 | ✅ | [T-101](specs/T-101-demo.md) |
`;

function runHook(files) {
  const root = mkdtempSync(join(tmpdir(), 'apk-hook-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      const full = join(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    return spawnSync(process.execPath, [HOOK], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('没有 docs/STATUS.md 的项目里不输出任何内容', () => {
  const result = runHook({ 'README.md': '# 别的项目\n' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('输出当前状态、开放问题和任务板，体检通过时只说一句', () => {
  const result = runHook({
    'AGENTS.md': '# AGENTS.md\n',
    'docs/STATUS.md': STATUS,
    'docs/BOARD.md': BOARD,
    'docs/specs/T-101-demo.md': '# T-101\n',
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /阶段.*开发中/);
  assert.match(result.stdout, /用哪家云/);
  assert.match(result.stdout, /BOARD · Ready（1）/);
  assert.match(result.stdout, /T-101 \| 示例任务/);
  assert.match(result.stdout, /BOARD · In progress（0）\n（空）/);
  assert.match(result.stdout, /## 体检\n通过。/);
});

test('任务板小节标题的大小写不影响读取', () => {
  const result = runHook({
    'AGENTS.md': '# AGENTS.md\n',
    'docs/STATUS.md': STATUS,
    'docs/BOARD.md': BOARD.replace('## Ready', '## READY').replace('## In progress', '## In Progress'),
    'docs/specs/T-101-demo.md': '# T-101\n',
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /BOARD · Ready（1）\n\| T-101/);
  assert.match(result.stdout, /## 体检\n通过。/);
});

test('体检有问题时列出来', () => {
  const result = runHook({
    'AGENTS.md': '# AGENTS.md\n',
    'docs/STATUS.md': STATUS.replace(TODAY, '2020-01-01'),
    'docs/BOARD.md': BOARD.replace('[T-101](specs/T-101-demo.md)', '还没写'),
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /## 体检（1 个错误，1 个提醒）/);
  assert.match(result.stdout, /错误：docs\/BOARD\.md:\d+ {2}T-101.*说明书/);
  assert.match(result.stdout, /提醒：docs\/STATUS\.md {2}.*2020-01-01/);
});

test('只有交接单、没有任务板时也能运行', () => {
  const result = runHook({ 'docs/STATUS.md': STATUS });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /## 当前/);
  assert.doesNotMatch(result.stdout, /BOARD · Ready/);
  assert.match(result.stdout, /缺少必需文件 AGENTS\.md/);
});
