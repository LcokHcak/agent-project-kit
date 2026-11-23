import { lstatSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function install(skillDirectory = join(homedir(), '.agents', 'skills')) {
  const source = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
  const target = join(skillDirectory, 'agent-project-kit');
  mkdirSync(dirname(target), { recursive: true });
  const entry = lstatSync(target, { throwIfNoEntry: false });
  if (!entry) symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  else if (realpathSync(target) !== source) throw Error('已存在另一个同名技能，请先核对 ' + target);
  return target;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log('Codex 技能入口 ' + install()); } catch (err) { console.error(err.message); process.exitCode = 1; }
}
