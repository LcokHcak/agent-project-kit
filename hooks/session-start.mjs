// SessionStart hook for agent-project-kit.
// In a project that uses the kit (has docs/STATUS.md), print the "当前" section, open questions,
// the active rows of docs/BOARD.md and the result of the project check; stdout becomes session context.
// In any other project it prints nothing, so installing the plugin globally is harmless.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const MAX_ROWS = 15;
const MAX_FINDINGS = 8;

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// If the reader goes away early, a failed write must not turn into a crash at session start.
process.stdout.on('error', () => {});

function read(relative) {
  try {
    return readFileSync(join(root, relative), 'utf8');
  } catch {
    return null;
  }
}

/** Body of the first "## <heading…>" section whose title starts with `prefix` (case-insensitive), up to the next "## ". */
function section(markdown, prefix) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex(line => line.startsWith('## ') && line.slice(3).trim().toLowerCase().startsWith(prefix.toLowerCase()));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => line.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

/** Data rows of the first table in a section (skips header and separator rows). */
function tableRows(markdown, prefix) {
  return section(markdown, prefix).split(/\r?\n/)
    .filter(line => line.startsWith('|'))
    .slice(2)
    .filter(line => line.replace(/[|\s]/g, '').length > 0);
}

function boardLines(board) {
  return ['In progress', 'Review', 'Ready'].flatMap(heading => {
    const rows = tableRows(board, heading);
    return [
      '',
      `## BOARD · ${heading}（${rows.length}）`,
      ...(rows.length ? rows.slice(0, MAX_ROWS) : ['（空）']),
      ...(rows.length > MAX_ROWS ? [`……另有 ${rows.length - MAX_ROWS} 条，见 docs/BOARD.md`] : []),
    ];
  });
}

/** Result of the project check. A broken check must never break session start, so failures are reported as one line. */
async function checkLines() {
  try {
    const { checkProject, formatFinding } = await import('../scripts/check.mjs');
    const { errors, warnings } = checkProject(root);
    if (errors.length + warnings.length === 0) return ['', '## 体检', '通过。'];
    const findings = [
      ...errors.map(finding => `- 错误：${formatFinding(finding)}`),
      ...warnings.map(finding => `- 提醒：${formatFinding(finding)}`),
    ];
    return [
      '',
      `## 体检（${errors.length} 个错误，${warnings.length} 个提醒）`,
      ...findings.slice(0, MAX_FINDINGS),
      ...(findings.length > MAX_FINDINGS ? [`……另有 ${findings.length - MAX_FINDINGS} 条，运行 /agent-project-kit:flow check 看全部`] : []),
      ...(errors.length ? ['有错误时先修掉它们（/agent-project-kit:flow check），再开始别的工作。'] : []),
    ];
  } catch (error) {
    return ['', '## 体检', `没能运行（${error instanceof Error ? error.message : String(error)}）。可以手动运行 /agent-project-kit:flow check。`];
  }
}

const status = read('docs/STATUS.md');
if (status) {
  const board = read('docs/BOARD.md');
  const questions = section(status, '开放问题');
  const out = [
    `[agent-project-kit] ${basename(root)} 的项目状态（来自 docs/STATUS.md 和 docs/BOARD.md）。开工前先读 AGENTS.md。`,
    '',
    '## 当前',
    section(status, '当前') || '（STATUS.md 没有「当前」一节）',
    ...(questions ? ['', '## 开放问题', questions] : []),
    ...(board ? boardLines(board) : []),
    ...(await checkLines()),
    '',
    '可用：/agent-project-kit:flow next 看下一步，flow case 把一次出错存成回归用例，flow handoff 在结束前更新交接单。',
  ];
  process.stdout.write(`${out.join('\n')}\n`);
}
