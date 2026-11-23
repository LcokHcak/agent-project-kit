import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { demo } from '../examples/team-week.mjs';
import { assign, daily, inbox, weekly } from '../scripts/team.mjs';
import { install } from '../scripts/install-codex.mjs';

function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-week-'));
  t.after(() => rmSync(dir, {recursive:true,force:true}));
  return dir;
}

test('可运行示例覆盖单人工作、双人派单、周回顾及离线收件箱', t => {
  const root = join(temp(t), '读书会');
  assert.match(demo(root), /T-102/);
  assert.doesNotMatch(inbox(root, '小周'), /T-101/);
  assign(root, 'T-102', '小林');
  assert.match(inbox(root, '小周'), /暂无待办/);
  assert.match(inbox(root, '小林'), /T-102/);
  assert.throws(() => assign(root, 'T-999', '小林'), /不存在/);
  const pkg = join(root,'handoff');
  const saved = readFileSync(join(pkg,'docs/weekly/2026-11-23.md'),'utf8');
  assert.match(saved,/两次模拟报名/);
  assert.match(saved,/请小周复测新文案/);
  assert.doesNotMatch(saved,/确认地址后更新报名页/);
  const cli = execFileSync(process.execPath,[join(pkg,'scripts/kit-team.mjs'),'inbox','小周'],{cwd:pkg,encoding:'utf8'});
  assert.match(cli,/T-102/);
});

test('跨年周、同日更新、作者隔离和未填报日期', t => {
  const root = temp(t);
  mkdirSync(join(root,'docs')); writeFileSync(join(root,'docs/BOARD.md'),'# BOARD');
  daily(root,'2026-12-31','甲','旧记录','暂无','复核');
  daily(root,'2026-12-31','甲','复核通过','暂无','归档');
  daily(root,'2027-01-01','乙','已交接','暂无','跟进');
  daily(root,'2027-01-04','甲','下周事项','暂无','开始');
  const week = weekly(root,'2027-01-03');
  assert.match(week,/2026-12-28/); assert.match(week,/复核通过/); assert.match(week,/乙/);
  assert.doesNotMatch(week,/旧记录|下周事项/);
  assert.throws(() => daily(root,'2026-02-30','甲','测试','暂无','完成'),/日期/);
  assert.throws(() => daily(root,'2026-12-31','../甲','测试','暂无','完成'),/负责人/);
});

test('Codex 通用技能入口可重复安装并指向完整套件', t => {
  const dir = temp(t);
  const target = install(dir);
  assert.equal(install(dir),target);
  assert.match(readFileSync(join(target,'SKILL.md'),'utf8'),/name: agent-project-kit/);
  assert.match(readFileSync(join(target,'skills/flow/SKILL.md'),'utf8'),/assign/);
});
