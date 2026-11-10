#!/usr/bin/env node
// agent-project-kit 体检：把「靠人记得」的项目约定变成可以机械执行的检查。
// 零依赖，Node 18+。既能被 flow 技能和 SessionStart hook 调用，也能复制进项目、放进 CI：
//   node check.mjs [项目根目录] [--strict] [--json] [--stale-days N] [--max-in-progress N]
// 退出码：0 通过；1 有错误（加 --strict 时有提醒也算）；2 参数写错或脚本自己出错。
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_FILES = ['AGENTS.md', 'docs/STATUS.md', 'docs/BOARD.md'];
const PLACEHOLDER_FILES = [...REQUIRED_FILES, 'CLAUDE.md', '.github/workflows/ci.yml'];
const LINK_CHECK_ROOT_FILES = ['AGENTS.md', 'CLAUDE.md'];
const LINK_CHECK_DIRS = ['docs', 'evals'];
const SECTIONS_NEEDING_SPEC = ['in progress', 'review', 'ready'];
const SECTIONS_NEEDING_EVIDENCE = ['done'];
const AGENTS_MAX_LINES = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

const PLACEHOLDER = /\{\{[A-Z][A-Z0-9_]*\}\}/g;
const TASK_ID = /(?<![A-Za-z0-9])[A-Z][A-Z0-9]*-\d+[a-z]?(?![A-Za-z0-9])/;
const SPEC_FILE_ID = /^([A-Z][A-Z0-9]*-\d+[a-z]?)(?=[-._])/;
const TYPES_WITHOUT_SPEC = /杂务|chore/i;
// [文字](目标 "标题")：文字里可以再套一层方括号（图片徽章），目标里可以有一层成对的圆括号（foo(1).md）。
const MARKDOWN_LINK = /!?\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\(\s*(<[^>]*>|(?:[^()\s]|\([^()\s]*\))+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
// 「协议:」开头（https:、mailto:、javascript:、盘符 C:）、//host 和反斜杠开头的路径，都不当作项目里的文件。
const NOT_A_LOCAL_PATH = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\\)/i;
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;
const UPDATED_ON = /更新于\s*(\d{4}-\d{2}-\d{2})/g;

const toPosix = path => path.split(sep).join('/');
const sameName = (a, b) => a.normalize('NFC') === b.normalize('NFC');

/** 只读的文件访问，带目录缓存；exists() 区分大小写，避免 Windows/macOS 上能过、Linux CI 上断链。 */
function createFiles(root) {
  const listings = new Map();
  const list = dir => {
    if (!listings.has(dir)) {
      let entries = [];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        // 目录不存在或读不了：当成空目录，由调用方决定这算不算问题。
      }
      listings.set(dir, entries);
    }
    return listings.get(dir);
  };
  const read = path => {
    try {
      return readFileSync(join(root, path), 'utf8').replace(/^\uFEFF/, '');
    } catch {
      return null;
    }
  };
  // 项目外的路径（../../x、另一个盘符、网络共享路径）一律不碰文件系统：
  // 换一台机器就不成立，而且 Windows 上探测 UNC 路径会发起网络连接。
  const contains = absolute => {
    const inside = relative(root, absolute);
    return inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
  };
  const exists = absolute => {
    if (!contains(absolute)) return false;
    const inside = relative(root, absolute);
    let dir = root;
    for (const part of inside.split(sep).filter(Boolean)) {
      if (!list(dir).some(entry => sameName(entry.name, part))) return false;
      dir = join(dir, part);
    }
    return true;
  };
  const walk = dir => list(join(root, dir)).flatMap(entry => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : walk(path);
    return entry.isFile() ? [path] : [];
  });
  return { read, contains, exists, walk, names: dir => list(join(root, dir)).map(entry => entry.name) };
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim());
}

/**
 * 把任务板拆成小节：[{ heading, line, header, rows: [{ id, cells, line, raw }] }]。
 * 只认第一格里有编号（如 T-101、T-901a）的行，表头、分隔行和空行都跳过。
 */
export function parseBoard(markdown) {
  const sections = [];
  markdown.split(/\r?\n/).forEach((text, index) => {
    if (text.startsWith('## ')) {
      sections.push({ heading: text.slice(3).trim(), line: index + 1, header: null, rows: [] });
      return;
    }
    const current = sections.at(-1);
    if (!current || !text.trim().startsWith('|')) return;
    const cells = splitRow(text);
    if (!current.header) {
      current.header = cells;
      return;
    }
    if (cells.every(cell => /^:?-+:?$/.test(cell))) return;
    const id = cells[0].match(TASK_ID)?.[0];
    if (id) current.rows.push({ id, cells, line: index + 1, raw: text });
  });
  return sections;
}

const sectionIs = (section, names) => names.some(name => section.heading.toLowerCase().startsWith(name));

/** 按表头名字取某一列的值；这一节没有这一列时返回 undefined。 */
function cellOf(section, row, columnName) {
  const index = (section.header ?? []).findIndex(title => title.includes(columnName));
  return index < 0 ? undefined : row.cells[index] ?? '';
}

/** 去掉一行里的 HTML 注释；注释可以跨行，所以把「还在注释里」的状态带出去。 */
function stripComments(text, inComment) {
  if (inComment) {
    const end = text.indexOf('-->');
    return end < 0 ? { visible: '', inComment: true } : stripComments(text.slice(end + 3), false);
  }
  const start = text.indexOf('<!--');
  if (start < 0) return { visible: text, inComment: false };
  const rest = stripComments(text.slice(start + 4), true);
  return { visible: text.slice(0, start) + rest.visible, inComment: rest.inComment };
}

/** 一段文字里的链接目标；链接文字里套着的图片（徽章）也算。 */
function linkTargets(text) {
  return [...text.matchAll(MARKDOWN_LINK)].flatMap(match => [match[2], ...linkTargets(match[1])]);
}

/** 正文里的 Markdown 链接（跳过代码块、行内代码和 HTML 注释），带行号。 */
function extractLinks(markdown) {
  const links = [];
  let fence = null;
  let inComment = false;
  markdown.split(/\r?\n/).forEach((text, index) => {
    const [, marker, info] = (inComment ? null : text.match(FENCE)) ?? [];
    if (marker && !fence) {
      fence = marker;
      return;
    }
    if (fence) {
      // 结束标记要和开始标记同一种字符、至少一样长、后面不带语言名。
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && info.trim() === '') fence = null;
      return;
    }
    const stripped = stripComments(inComment ? text : text.replace(/`[^`]*`/g, ''), inComment);
    inComment = stripped.inComment;
    for (const target of linkTargets(stripped.visible)) links.push({ target, line: index + 1 });
  });
  return links;
}

/** 链接目标里的本地路径；外部链接、页内锚点返回 null。去掉 #锚点 和 :行号。 */
function localPath(target) {
  const raw = target.replace(/^<|>$/g, '').trim();
  const path = raw.split('#')[0].split('?')[0].replace(/:\d+(?:-\d+)?$/, '');
  if (!path || NOT_A_LOCAL_PATH.test(path)) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function resolveLink(root, fromFile, path) {
  return path.startsWith('/') ? join(root, path) : resolve(root, dirname(fromFile), path);
}

function checkRequiredFiles(files) {
  return REQUIRED_FILES
    .filter(file => files.read(file) === null)
    .map(file => ({ file, message: `缺少必需文件 ${file}（用 /agent-project-kit:project-init 生成）` }));
}

function checkPlaceholders(files) {
  return PLACEHOLDER_FILES.flatMap(file => {
    const content = files.read(file);
    if (content === null) return [];
    return content.split(/\r?\n/).flatMap((text, index) =>
      [...new Set(text.match(PLACEHOLDER) ?? [])].map(name => ({ file, line: index + 1, message: `占位符 ${name} 还没替换` })));
  });
}

function checkLinks(root, files) {
  const candidates = [...LINK_CHECK_ROOT_FILES, ...LINK_CHECK_DIRS.flatMap(dir => files.walk(dir))];
  return candidates
    .filter(file => file.endsWith('.md') && !file.split('/').at(-1).startsWith('_'))
    .flatMap(file => extractLinks(files.read(file) ?? '').flatMap(({ target, line }) => {
      const path = localPath(target);
      const absolute = path === null ? null : resolveLink(root, file, path);
      if (absolute === null || !files.contains(absolute) || files.exists(absolute)) return [];
      return [{ file, line, message: `链接指向不存在的文件：${path}（注意大小写）` }];
    }));
}

function checkDuplicateIds(sections) {
  const linesById = new Map();
  for (const row of sections.flatMap(section => section.rows)) {
    linesById.set(row.id, [...(linesById.get(row.id) ?? []), row.line]);
  }
  return [...linesById]
    .filter(([, lines]) => lines.length > 1)
    .map(([id, lines]) => ({ file: 'docs/BOARD.md', line: lines[1], message: `编号 ${id} 在任务板上重复出现（第 ${lines.join('、')} 行）` }));
}

function hasSpec(root, files, row) {
  const linked = extractLinks(row.raw).some(({ target }) => {
    const path = localPath(target);
    return path !== null && files.exists(resolveLink(root, 'docs/BOARD.md', path));
  });
  return linked || files.names('docs/specs').some(name => name.match(SPEC_FILE_ID)?.[1] === row.id);
}

function checkSpecs(root, files, sections) {
  return sections.filter(section => sectionIs(section, SECTIONS_NEEDING_SPEC)).flatMap(section => section.rows
    .filter(row => !TYPES_WITHOUT_SPEC.test(cellOf(section, row, '类型') ?? '') && !hasSpec(root, files, row))
    .map(row => ({
      file: 'docs/BOARD.md',
      line: row.line,
      message: `${row.id} 在 ${section.heading} 里但找不到说明书（应有 docs/specs/${row.id}-*.md；杂务可以不写）`,
    })));
}

function checkStatusFreshness(files, today, staleDays) {
  const status = files.read('docs/STATUS.md');
  if (status === null) return [];
  const dates = [...status.matchAll(UPDATED_ON)].map(match => match[1]).sort();
  if (dates.length === 0) {
    return [{ file: 'docs/STATUS.md', message: '交接单里找不到「更新于 YYYY-MM-DD」，没法判断它是不是还新' }];
  }
  const latest = dates.at(-1);
  const updatedAt = Date.parse(`${latest}T00:00:00Z`);
  if (Number.isNaN(updatedAt)) {
    return [{ file: 'docs/STATUS.md', message: `交接单里的「更新于 ${latest}」不是一个有效日期` }];
  }
  const age = Math.floor((today.getTime() - updatedAt) / DAY_MS);
  if (age <= staleDays) return [];
  return [{ file: 'docs/STATUS.md', message: `交接单上次更新于 ${latest}，已经 ${age} 天（超过 ${staleDays} 天）；确认内容还是真的，再更新日期` }];
}

function checkInProgress(sections, maxInProgress) {
  return sections.filter(section => sectionIs(section, ['in progress'])).flatMap(section => {
    const tooMany = section.rows.length > maxInProgress
      ? [{ file: 'docs/BOARD.md', line: section.line, message: `${section.heading} 有 ${section.rows.length} 个任务，约定最多 ${maxInProgress} 个同时进行` }]
      : [];
    const unowned = section.rows
      .filter(row => cellOf(section, row, '谁') === '')
      .map(row => ({ file: 'docs/BOARD.md', line: row.line, message: `${row.id} 在 ${section.heading} 里但没写谁在做` }));
    return [...tooMany, ...unowned];
  });
}

function checkEvidence(sections) {
  return sections.filter(section => sectionIs(section, SECTIONS_NEEDING_EVIDENCE)).flatMap(section => section.rows
    .filter(row => cellOf(section, row, '证据') === '')
    .map(row => ({ file: 'docs/BOARD.md', line: row.line, message: `${row.id} 在 ${section.heading} 里但没写证据` })));
}

function checkOrphanSpecs(files, board) {
  return files.names('docs/specs')
    .map(name => ({ name, id: name.match(SPEC_FILE_ID)?.[1] }))
    .filter(({ id }) => id && !new RegExp(`(?<![A-Za-z0-9])${id}(?![A-Za-z0-9])`).test(board))
    .map(({ name, id }) => ({ file: `docs/specs/${name}`, message: `说明书对应的 ${id} 不在任务板上` }));
}

function checkAgentsLength(files) {
  const agents = files.read('AGENTS.md');
  const lines = agents === null ? 0 : agents.split(/\r?\n/).length;
  if (lines <= AGENTS_MAX_LINES) return [];
  return [{ file: 'AGENTS.md', message: `AGENTS.md 有 ${lines} 行（建议不超过 ${AGENTS_MAX_LINES} 行）：它是地图，细节挪到 docs/ 里再链接过去` }];
}

/**
 * 检查一个用 agent-project-kit 管理的项目。
 * @returns {{ errors: Finding[], warnings: Finding[] }}，Finding = { file, line?, message }
 */
export function checkProject(root, { today = new Date(), staleDays = 14, maxInProgress = 3 } = {}) {
  const absoluteRoot = resolve(root);
  const files = createFiles(absoluteRoot);
  const board = files.read('docs/BOARD.md');
  const sections = board === null ? [] : parseBoard(board);
  return {
    errors: [
      ...checkRequiredFiles(files),
      ...checkPlaceholders(files),
      ...checkDuplicateIds(sections),
      ...checkSpecs(absoluteRoot, files, sections),
      ...checkLinks(absoluteRoot, files),
    ],
    warnings: [
      ...checkStatusFreshness(files, today, staleDays),
      ...checkInProgress(sections, maxInProgress),
      ...checkEvidence(sections),
      ...(board === null ? [] : checkOrphanSpecs(files, board)),
      ...checkAgentsLength(files),
    ],
  };
}

export function formatFinding({ file, line, message }) {
  return `${file}${line ? `:${line}` : ''}  ${message}`;
}

const BOOLEAN_FLAGS = { '--strict': 'strict', '--json': 'json' };
const NUMBER_FLAGS = { '--stale-days': 'staleDays', '--max-in-progress': 'maxInProgress' };
const USAGE = '用法：node check.mjs [项目根目录] [--strict] [--json] [--stale-days N] [--max-in-progress N]';

/** 写错的参数要报出来：CI 里把 --strict 拼错却照样通过，比不检查更糟。 */
function parseArgs(argv) {
  const tokens = argv.flatMap(arg => {
    const inline = arg.match(/^(--[a-z-]+)=(.*)$/);
    return inline && NUMBER_FLAGS[inline[1]] ? [inline[1], inline[2]] : [arg];
  });
  const parsed = { positional: [], problems: [] };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (BOOLEAN_FLAGS[token]) {
      parsed[BOOLEAN_FLAGS[token]] = true;
    } else if (NUMBER_FLAGS[token]) {
      index += 1;
      if (/^\d+$/.test(tokens[index] ?? '')) parsed[NUMBER_FLAGS[token]] = Number(tokens[index]);
      else parsed.problems.push(`${token} 后面要跟一个非负整数`);
    } else if (token.startsWith('-')) {
      parsed.problems.push(`不认识的参数 ${token}`);
    } else {
      parsed.positional.push(token);
    }
  }
  if (parsed.positional.length > 1) parsed.problems.push(`只能给一个项目根目录，收到了 ${parsed.positional.length} 个`);
  return { ...parsed, root: parsed.positional[0] ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd() };
}

function report(root, { errors, warnings }) {
  const lines = [
    ...errors.map(finding => `错误  ${formatFinding(finding)}`),
    ...warnings.map(finding => `提醒  ${formatFinding(finding)}`),
    errors.length + warnings.length === 0
      ? `体检通过：${root}`
      : `体检结果：${errors.length} 个错误，${warnings.length} 个提醒（${root}）`,
  ];
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const { root, strict, json, staleDays, maxInProgress, problems } = parseArgs(argv);
  if (problems.length > 0) {
    process.stderr.write(`${problems.join('\n')}\n${USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  const options = Object.fromEntries(Object.entries({ staleDays, maxInProgress }).filter(([, value]) => value !== undefined));
  const result = checkProject(root, options);
  process.stdout.write(json ? `${JSON.stringify({ root: resolve(root), ...result }, null, 2)}\n` : report(resolve(root), result));
  process.exitCode = result.errors.length > 0 || (strict && result.warnings.length > 0) ? 1 : 0;
}

function isMain() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`体检脚本自己出错了：${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 2;
  }
}
