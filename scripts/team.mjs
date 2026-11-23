import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const checker = existsSync(new URL('./kit-check.mjs', import.meta.url)) ? './kit-check.mjs' : './check.mjs';
const { parseBoard } = await import(checker);
const read = path => readFileSync(path, 'utf8');
const marker = '<!-- agent-project-kit:weekly -->';

function person(name) {
  if (!name || !/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,63}$/u.test(name) || /[. ]$/.test(name)) {
    throw Error('负责人请使用姓名或团队内唯一的 Agent 名称');
  }
  return name.normalize('NFC');
}

function dateOf(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error('日期格式为 YYYY-MM-DD');
  const value = new Date(day + 'T00:00:00Z');
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== day) throw Error('日期不存在');
  return value;
}

function doc(root, ...parts) {
  let path = root;
  for (const part of ['docs', ...parts]) {
    path = join(path, part);
    if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) throw Error('文档路径包含链接 ' + path);
  }
  return path;
}

function edit(path, transform) {
  mkdirSync(dirname(path), { recursive: true });
  const lock = path + '.kit-lock';
  writeFileSync(lock, String(process.pid), { flag: 'wx' });
  const tmp = path + '.' + randomUUID() + '.tmp';
  try {
    const before = existsSync(path) ? read(path) : undefined;
    const after = transform(before);
    if (before === after) return;
    writeFileSync(tmp, after, { flag: 'wx' });
    if ((existsSync(path) ? read(path) : undefined) !== before) throw Error('编辑期间文档已更新，请重试');
    renameSync(tmp, path);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
    unlinkSync(lock);
  }
}

const ownerColumn = section => section.header?.findIndex(title => ['负责人','谁在做','Owner'].includes(title)) ?? -1;
const active = section => /^(Ready|In progress|Review)(?:\b|$)/i.test(section.heading);

export function assign(root, id, name) {
  const owner = person(name);
  edit(doc(root, 'BOARD.md'), before => {
    if (!before) throw Error('缺少任务板，请先初始化项目');
    const sections = parseBoard(before);
    const matches = sections.flatMap(section => section.rows.filter(r => r.id === id).map(row => ({ section, row })));
    if (matches.length !== 1) throw Error('任务编号不存在或重复 ' + id);
    const { section, row } = matches[0];
    if (!active(section)) throw Error('任务需要处于 Ready、In progress 或 Review');
    const lines = before.split(/\r?\n/);
    let index = ownerColumn(section);
    if (index < 0) {
      const end = sections.find(s => s.line > section.line)?.line ?? lines.length + 1;
      const header = lines.findIndex((line, i) => i >= section.line && i < end - 1 && /^\s*\|/.test(line));
      if (header < 0 || !/^\s*\|\s*:?-+/.test(lines[header + 1])) throw Error('任务板表头格式有误');
      const append = (line, cell) => line.trimEnd().replace(/\|$/, '') + '| ' + cell + ' |';
      lines[header] = append(lines[header], '负责人');
      lines[header + 1] = append(lines[header + 1], '---');
      for (const item of section.rows) lines[item.line - 1] = append(lines[item.line - 1], '');
      index = section.header.length;
    }
    const cells = row.cells.slice();
    while (cells.length <= index) cells.push('');
    cells[index] = owner;
    lines[row.line - 1] = '| ' + cells.join(' | ') + ' |';
    return lines.join(before.includes('\r\n') ? '\r\n' : '\n');
  });
  return id + ' → ' + owner;
}

export function inbox(root, name) {
  const owner = person(name);
  const items = [];
  for (const section of parseBoard(read(doc(root, 'BOARD.md'))).filter(active)) {
    const index = ownerColumn(section);
    for (const row of section.rows) {
      if (row.cells[index] === owner) items.push('- ' + section.heading + ' · ' + row.id + ' · ' + row.cells[1]);
    }
  }
  return ['# ' + owner + ' 的任务', '', ...(items.length ? items : ['暂无待办。'])].join('\n');
}

export function daily(root, day, name, done, blockers, next) {
  dateOf(day);
  const owner = person(name);
  if (![done, blockers, next].every(v => typeof v === 'string' && v.trim())) throw Error('请填写进展与证据、阻塞、下一步');
  if (!existsSync(doc(root, 'BOARD.md'))) throw Error('请先初始化项目');
  const path = doc(root, 'daily', day, 'log-' + owner + '.md');
  const title = '# ' + day + ' · ' + owner;
  const content = title + '\n\n## 进展与证据\n\n' + done.trim() + '\n\n## 阻塞与求助\n\n' +
    blockers.trim() + '\n\n## 下一步\n\n' + next.trim() + '\n';
  edit(path, before => {
    if (before && before.split(/\r?\n/, 1)[0] !== title) throw Error('已有文档作者或格式不符，请核对日报');
    return content;
  });
  return path;
}

export function weekly(root, day, save = false) {
  const monday = dateOf(day);
  if (!existsSync(doc(root, 'BOARD.md'))) throw Error('请先初始化项目');
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const start = monday.toISOString().slice(0, 10);
  const groups = new Map([['进展与证据', []], ['阻塞与求助', []], ['下一步', []]]);
  const latestNext = new Map();
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(monday.getTime() + offset * 86400000).toISOString().slice(0, 10);
    const dir = doc(root, 'daily', date);
    if (!existsSync(dir)) continue;
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!item.isFile() || !item.name.startsWith('log-') || !item.name.endsWith('.md')) continue;
      const note = read(join(dir, item.name));
      const owner = item.name.slice(4, -3);
      const source = '../daily/' + date + '/' + item.name;
      for (const part of note.split(/^## /m).slice(1)) {
        const [heading, ...body] = part.trim().split(/\r?\n/);
        if (!groups.has(heading)) continue;
        // Render notes as plain text here. Relative evidence links stay usable in the original daily.
        const summary = body.join(' ').trim().replace(/[\\`*_[\]<>]/g, '\\$&');
        const line = '- [' + date + ' · ' + owner + '](<' + source + '>) ' + summary;
        if (heading === '下一步') latestNext.set(owner, line);
        else groups.get(heading).push(line);
      }
    }
  }
  groups.set('下一步', [...latestNext.values()]);
  const sections = [...groups].map(([heading, lines]) => '## ' + heading + '\n\n' + (lines.join('\n') || '暂无记录。'));
  const summary = marker + '\n# 周回顾 · ' + start + ' 起\n\n' + sections.join('\n\n') + '\n';
  if (save) {
    const path = doc(root, 'weekly', start + '.md');
    edit(path, before => {
      if (before && !before.startsWith(marker)) throw Error('已有手写周报，请另存后重试');
      return summary;
    });
    return path;
  }
  return summary;
}

function main([action, ...args]) {
  const root = process.cwd();
  if (action === 'assign' && args.length === 2) return assign(root, ...args);
  if (action === 'inbox' && args.length === 1) return inbox(root, ...args);
  if (action === 'daily' && args.length === 5) return daily(root, ...args);
  if (action === 'weekly' && (args.length === 1 || (args.length === 2 && args[1] === '--save'))) return weekly(root, args[0], args.length === 2);
  throw Error('用法：assign <任务号> <负责人> | inbox <负责人> | daily <日期> <负责人> <进展与证据> <阻塞> <下一步> | weekly <周内日期> [--save]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(main(process.argv.slice(2))); } catch (err) { console.error(err.message); process.exitCode = 1; }
}
