# agent-project-kit

**一个人 + 多个 AI Agent 做项目的基础设施。** 一个 Claude Code 插件，装好之后，任何项目都能一条命令搭起同一套「记录什么、写在哪、谁做什么」的体系。

> Agent 不记得上一次对话。换一个会话、换成 Codex 或 Cursor，记忆都会清零。
> 所以**仓库本身就是共享记忆**：下一个 Agent 需要知道的，都写进仓库里的文件。

## 它解决什么问题

一个人带着几个 Agent 做项目，常见的崩溃方式有这些：

- 新会话不知道做到哪了，重新探索一遍，还推翻之前的决定；
- 两个 Agent 同时改同一个文件，互相覆盖；
- 「做完了」没有证据，结果其实没跑通；
- 查过的厂商文档没记下来，每个 Agent 都重新查一遍，结论还不一样；
- 选型理由只留在聊天记录里，下次又被改回去。

## 三层记录

| 层 | 文件 | 作用 | 多久更新 |
| --- | --- | --- | --- |
| 规则 | `AGENTS.md` | 每个 Agent 先读它：命令、硬性规则、代码地图、协作流程。Codex、Cursor 都认这个文件 | 很少改 |
| 状态 | `docs/STATUS.md` | **交接单**：到哪了、什么能用、踩过的坑、验收记录、待拍板的问题 | 每次会话结束 |
| | `docs/BOARD.md` | **任务板**：编号、状态、谁在做 | 任务状态一变就改 |
| 知识（只增不改） | `docs/specs/` | **任务说明书**：交给 Agent 的需求，写明验收标准和能改哪些文件 | 开工前 |
| | `docs/adr/` | **为什么**这么选 | 做重要决定时 |
| | `docs/research/` | 外部资料，附出处和日期 | 调研完 |

## 角色分工

| 角色 | 谁 | 负责 |
| --- | --- | --- |
| 产品负责人 | 你 | 定方向、拍板、验收，提供密钥和硬件 |
| 总控 | 主会话 | 拆任务、写说明书、维护任务板和交接单、合并分支、改共享文件 |
| 执行者 | 任务会话 | 一个任务一个会话、一个分支，只改说明书允许的文件 |
| 专家 | 子代理 | 审查、安全检查、调研，用完即走 |

并行规则：按目录切分，一个文件同一时间只有一个执行者；共享文件只由总控改；同时最多 3 个执行者，因为瓶颈是你审查的速度。

完整的方法论在 [`skills/project-init/templates/docs/workflow.md`](skills/project-init/templates/docs/workflow.md)，初始化时会复制进你的项目。

## 安装

在 Claude Code 里执行：

```text
/plugin marketplace add LcokHcak/agent-project-kit
/plugin install agent-project-kit@agent-project-kit
```

或者在终端执行：

```bash
claude plugin marketplace add LcokHcak/agent-project-kit
```

```bash
claude plugin install agent-project-kit@agent-project-kit
```

装好后重启 Claude Code。以后更新：

```bash
claude plugin marketplace update agent-project-kit
```

## 使用

**1. 给项目初始化一次**（在项目目录里打开会话）：

```text
/agent-project-kit:project-init
```

它会读你的仓库，推断命令、代码地图和共享文件，最多问你 3 个问题，然后生成 `AGENTS.md`、`CLAUDE.md`、`docs/STATUS.md`、`docs/BOARD.md`、`docs/workflow.md` 和三个模板目录，并在任务板上放好起步任务。**已存在的文件不会被覆盖**，也不会自动提交。

**2. 日常使用：**

| 命令 | 做什么 |
| --- | --- |
| `/agent-project-kit:flow next` | 读交接单和任务板，建议下一步做什么、哪些可以并行 |
| `/agent-project-kit:flow new <想法>` | 把想法写成带验收标准的说明书，放上任务板 |
| `/agent-project-kit:flow start T-xxx` | 开工：检查冲突、建分支、测试先行 |
| `/agent-project-kit:flow finish` | 收尾：跑检查、逐条核对验收标准、派审查子代理、更新任务板和交接单 |
| `/agent-project-kit:flow handoff` | 会话结束前更新交接单，下一个 Agent 读它就能接上 |

直接用自然语言说也可以，比如「下一步做什么」「开工 T-102」「交接一下」。

**3. 自动的部分：**

- **会话启动 hook**：项目里有 `docs/STATUS.md` 时，每次开会话都会自动把「当前」一节、开放问题和任务板的进行中任务注入上下文。其他项目里它不输出任何内容。
- **`vendor-researcher` 子代理**：调研类任务交给它。它只信官方文档，每条结论附出处和日期，只往 `docs/research/` 写。

## 不用 Claude Code？

这些文件本身就是通用的：

- 把 [`skills/project-init/templates/`](skills/project-init/templates/) 复制到项目根目录，手动替换 `{{占位符}}`。
- `AGENTS.md` 是 Codex、Cursor 等工具都会读的标准文件。
- [`skills/flow/SKILL.md`](skills/flow/SKILL.md) 里的五个动作，可以直接当提示词交给任何 Agent。

## 目录

```text
.claude-plugin/
├── plugin.json          插件清单
└── marketplace.json     让这个仓库同时作为插件市场，可以直接 /plugin marketplace add
skills/
├── project-init/        初始化 skill
│   └── templates/       装进项目的文件（AGENTS.md、CLAUDE.md、docs/…）
└── flow/                任务流程 skill（new / next / start / finish / handoff）
agents/
└── vendor-researcher.md 调研子代理
hooks/
├── hooks.json           SessionStart hook 配置
└── session-start.mjs    注入 STATUS 和 BOARD（需要 Node.js）
```

## 要求

- Claude Code（支持插件的版本）
- Node.js（启动 hook 要用；没有 Node 时 hook 不会生效，其他功能照常）

## 许可

MIT
