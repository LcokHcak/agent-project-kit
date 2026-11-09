// SessionStart hook for agent-project-kit.
// In a project that uses the kit (has docs/STATUS.md), print the "当前" section, open questions
// and the active rows of docs/BOARD.md; stdout becomes session context.
// In any other project it prints nothing, so installing the plugin globally is harmless.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function read(relative) {
  try {
    return readFileSync(join(root, relative), 'utf8');
  } catch {
    return null;
  }
}

/** Body of the first "## <heading…>" section whose title starts with `prefix`, up to the next "## ". */
function section(markdown, prefix) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex(line => line.startsWith('## ') && line.slice(3).trim().startsWith(prefix));
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

const status = read('docs/STATUS.md');
if (!status) process.exit(0);

const board = read('docs/BOARD.md');
const out = [
  `[agent-project-kit] ${basename(root)} 的项目状态（来自 docs/STATUS.md 和 docs/BOARD.md）。开工前先读 AGENTS.md。`,
  '',
  '## 当前',
  section(status, '当前') || '（STATUS.md 没有「当前」一节）',
];

const questions = section(status, '开放问题');
if (questions) out.push('', '## 开放问题', questions);

if (board) {
  for (const heading of ['In progress', 'Review', 'Ready']) {
    const rows = tableRows(board, heading);
    out.push('', `## BOARD · ${heading}（${rows.length}）`, ...(rows.length ? rows.slice(0, 15) : ['（空）']));
    if (rows.length > 15) out.push(`……另有 ${rows.length - 15} 条，见 docs/BOARD.md`);
  }
}

out.push('', '可用：/agent-project-kit:flow next 看下一步，/agent-project-kit:flow handoff 在结束前更新交接单。');
process.stdout.write(out.join('\n') + '\n');
