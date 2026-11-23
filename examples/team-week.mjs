// Run from a clone of the plugin. The destination must be a new directory.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assign, daily, inbox, weekly } from '../scripts/team.mjs';
import { exportProject } from '../scripts/handoff.mjs';

export function demo(root) {
  mkdirSync(root);
  mkdirSync(join(root, 'docs', 'specs'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  for (const script of ['team','check','handoff']) {
    copyFileSync(new URL('../scripts/' + script + '.mjs', import.meta.url), join(root,'scripts','kit-' + script + '.mjs'));
  }
  const put = (path, text) => writeFileSync(join(root, path), text + '\n');
  put('AGENTS.md', '# 社区读书会\n\n目标是让第一次参加的人能独自完成报名。负责人在任务板领任务，验收后附证据。');
  put('docs/STATUS.md', '# 交接单\n\n## 当前\n\n模拟数据。本周准备开放报名，等待场地确认。\n\n更新于 2026-11-23');
  put('docs/BOARD.md', '# 任务板\n\n## Ready\n\n| 编号 | 任务 | 类型 | 说明书 |\n| --- | --- | --- | --- |\n' +
    '| T-101 | 改写报名须知 | 文案 | [须知](specs/T-101-copy.md) |\n' +
    '| T-102 | 演练报名流程 | 验收 | [演练](specs/T-102-walkthrough.md) |');
  put('docs/specs/T-101-copy.md', '# 报名须知\n\n验收：初次参加者可以从文案找到时间、地点和取消方式。');
  put('docs/specs/T-102-walkthrough.md', '# 报名演练\n\n验收：两位首次参加者各完成一次报名，记录观察到的卡点。');
  assign(root, 'T-101', '小林');
  daily(root, '2026-11-23', '小林', '首稿补上取消方式，见 T-101。', '等场地方确认门牌号。', '确认地址后更新报名页。');
  assign(root, 'T-102', '小周');
  daily(root, '2026-11-24', '小周', '完成两次模拟报名，一位读者没找到取消入口。', '请小林把取消方式移到报名按钮旁。', '用修改后的页面复测。');
  daily(root, '2026-11-25', '小林', '已把取消方式移到按钮旁；T-101 留有改稿。', '门牌号仍待确认。', '请小周复测新文案。');
  weekly(root, '2026-11-27', true);
  exportProject(root, join(root, 'handoff'));
  return inbox(root, '小周');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw Error('请给一个新的示例目录');
  console.log(demo(resolve(process.argv[2])));
}
