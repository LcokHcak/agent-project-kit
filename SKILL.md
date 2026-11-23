---
name: agent-project-kit
description: 在当前项目初始化项目协作流程，管理个人或团队的派单、任务收件箱、日报、周报、交接、复盘和经验检索。
---

以用户正在处理的项目为工作目录。套件目录是本 SKILL.md 所在的真实目录。需要创建项目记录时读套件的 skills/project-init/SKILL.md；日常任务读 skills/flow/SKILL.md 并按动作执行。脚本使用项目内已安装且支持该动作的版本，旧项目可直接用套件 scripts/ 下的对应脚本。模板和脚本按套件目录定位，所有项目数据按目标项目根目录定位。

接手已初始化项目时先读该项目的 AGENTS.md，并从项目根目录运行 `node "<套件目录>/hooks/session-start.mjs"`。用户个人与各团队的任务板、负责人、日报和同步目标分别保存在各自项目。
