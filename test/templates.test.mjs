import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkProject } from '../scripts/check.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEMPLATES = join(ROOT, 'skills/project-init/templates');
const PLACEHOLDER = /\{\{[A-Z][A-Z0-9_]*\}\}/g;
const FILES_WITH_PLACEHOLDERS = ['.github/workflows/ci.yml', 'AGENTS.md', 'docs/BOARD.md', 'docs/STATUS.md'];

const read = path => readFileSync(join(ROOT, path), 'utf8');
const unique = values => [...new Set(values)].sort();

function walk(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(join(dir, entry.name), path) : [path];
  });
}

const templateFiles = walk(TEMPLATES);

// 不用 fs.cpSync：Node 24 在 Windows 上遇到非 ASCII 路径会直接崩溃。
function install(files, from, to) {
  for (const path of files) {
    mkdirSync(dirname(join(to, path)), { recursive: true });
    copyFileSync(join(from, path), join(to, path));
  }
}
const placeholdersIn = path => unique(readFileSync(join(TEMPLATES, path), 'utf8').match(PLACEHOLDER) ?? []);

test('模板里的每个占位符都在 project-init 的说明里，反过来也一样', () => {
  const inTemplates = unique(templateFiles.flatMap(placeholdersIn));
  const documented = unique(read('skills/project-init/SKILL.md').match(PLACEHOLDER) ?? []);
  assert.deepEqual(inTemplates, documented);
});

test('只有说明里列出的那几个模板文件含占位符', () => {
  const withPlaceholders = templateFiles.filter(path => placeholdersIn(path).length > 0).sort();
  assert.deepEqual(withPlaceholders, FILES_WITH_PLACEHOLDERS);
  const skill = read('skills/project-init/SKILL.md');
  for (const path of FILES_WITH_PLACEHOLDERS) assert.ok(skill.includes(`\`${path}\``), `SKILL.md 没提到 ${path}`);
});

test('模板装进一个空项目并填好占位符之后，体检没有错误也没有提醒', () => {
  const project = mkdtempSync(join(tmpdir(), 'apk-templates-'));
  try {
    install(templateFiles, TEMPLATES, project);
    mkdirSync(join(project, 'scripts'), { recursive: true });
    copyFileSync(join(ROOT, 'scripts/check.mjs'), join(project, 'scripts/kit-check.mjs'));
    const today = new Date().toISOString().slice(0, 10);
    for (const path of FILES_WITH_PLACEHOLDERS) {
      const filled = readFileSync(join(project, path), 'utf8')
        .replaceAll('{{DATE}}', today)
        .replace(PLACEHOLDER, '已填写');
      writeFileSync(join(project, path), filled);
    }
    const result = checkProject(project);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('没填占位符的模板会被体检拦下', () => {
  const result = checkProject(TEMPLATES);
  const files = unique(result.errors.filter(finding => finding.message.includes('占位符')).map(finding => finding.file));
  assert.deepEqual(files, FILES_WITH_PLACEHOLDERS);
});

test('清单文件能解析，版本号和更新记录对得上', () => {
  const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
  const marketplace = JSON.parse(read('.claude-plugin/marketplace.json'));
  const hooks = JSON.parse(read('hooks/hooks.json'));
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  assert.equal(marketplace.plugins[0].name, plugin.name);
  assert.ok(hooks.hooks.SessionStart.length > 0);
  assert.ok(read('CHANGELOG.md').includes(`## ${plugin.version}`), `CHANGELOG.md 里没有 ${plugin.version} 这一节`);
});

test('flow 的每个动作在参数提示、README 和 CLAUDE.md 模板里都提到了', () => {
  const skill = read('skills/flow/SKILL.md');
  const actions = [...skill.matchAll(/^## ([a-z]+)/gm)].map(match => match[1]);
  assert.deepEqual(actions, ['new', 'next', 'start', 'finish', 'handoff', 'case', 'check']);
  const hint = skill.match(/^argument-hint: "(.*)"$/m)[1];
  const readme = read('README.md');
  const claude = readFileSync(join(TEMPLATES, 'CLAUDE.md'), 'utf8');
  for (const action of actions) {
    assert.ok(hint.split(' | ').some(part => part.split(' ')[0] === action), `argument-hint 缺 ${action}`);
    assert.ok(readme.includes(`flow ${action}`), `README 缺 flow ${action}`);
    assert.ok(claude.includes(`\`${action}`), `CLAUDE.md 模板缺 ${action}`);
  }
});

test('每个 skill 和子代理都有 name 和 description', () => {
  for (const path of ['skills/flow/SKILL.md', 'skills/project-init/SKILL.md', 'agents/vendor-researcher.md']) {
    const frontmatter = read(path).match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    assert.match(frontmatter, /^name: \S+/m, `${path} 缺 name`);
    assert.match(frontmatter, /^description: \S+/m, `${path} 缺 description`);
  }
});
