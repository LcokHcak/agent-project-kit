# agent-project-kit

[![ci](https://github.com/LcokHcak/agent-project-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/LcokHcak/agent-project-kit/actions/workflows/ci.yml)

**一个人 + 多个 AI Agent 做项目的基础设施。** 一个 Claude Code 插件，装好之后，任何项目都能一条命令搭起同一套「记录什么、写在哪、谁做什么、怎么不退步」的体系。

> Agent 不记得上一次对话。换一个会话、换成 Codex 或 Cursor，记忆都会清零。
> 所以**仓库本身就是共享记忆**：下一个 Agent 需要知道的，都写进仓库里的文件。
> 而写在文件里的规则也会被忘，所以**能让机器检查的规则，就交给机器检查**。

## 它解决什么问题

一个人带着几个 Agent 做项目，常见的崩溃方式有这些：

- 新会话不知道做到哪了，重新探索一遍，还推翻之前的决定；
- 两个 Agent 同时改同一个文件，互相覆盖；
- 「做完了」没有证据，结果其实没跑通；
- 查过的厂商文档没记下来，每个 Agent 都重新查一遍，结论还不一样；
- 选型理由只留在聊天记录里，下次又被改回去；
- 同一个错修了又犯：改了提示词，上周修好的问题又回来了；
- 账单涨了，不知道是哪一步、哪个模型花的；
- 规则写在文档里，写的时候很认真，三周后没人记得。

前五条靠**记录**解决，后三条靠**工程纪律**解决。

## 三层记录

| 层 | 文件 | 作用 | 多久更新 |
| --- | --- | --- | --- |
| 规则 | `AGENTS.md` | 每个 Agent 先读它：命令、硬性规则、代码地图、协作流程。Codex、Cursor 都认这个文件。保持短，它是地图 | 很少改 |
| 状态 | `docs/STATUS.md` | **交接单**：到哪了、什么能用、踩过的坑、验收记录、待拍板的问题 | 每次会话结束 |
| | `docs/BOARD.md` | **任务板**：编号、状态、谁在做 | 任务状态一变就改 |
| | `docs/plan/exec-plan.md` | **执行计划**（多阶段项目）：分工、依赖、每个阶段走完的标志、待拍板的决定 | 阶段变化时 |
| 知识（只增不改） | `docs/specs/` | **任务说明书**：交给 Agent 的需求，写明验收标准和能改哪些文件 | 开工前 |
| | `docs/adr/` | **为什么**这么选 | 做重要决定时 |
| | `docs/research/` | 外部资料，附出处和日期 | 调研完 |
| | `docs/experiments/` | 用数据在几个方案里做选择，判定标准在跑之前写好 | 有决定要做时 |
| | `evals/cases/` | **回归用例**：真实使用中出过的错，每个错一条 | 每次出错 |

## 三条工程纪律

| 纪律 | 意思 | 插件里对应什么 |
| --- | --- | --- |
| **出过的错都变成用例** | 每次真实使用中发现错误，先存成一条能重现的用例，再修。攒下来的用例就是这个项目自己的评测集，改提示词、换模型之前和之后都跑一遍 | `flow case`；`evals/` 模板；说明书「结果」里要写新增了哪条用例 |
| **每次模型调用都留痕** | 模型、提示词版本、token、费用、耗时都记下来。提示词当代码管，花钱之前先估算 | 调用模型的项目，初始化时在 `AGENTS.md` 里写入这三条规则；说明书有「花费与风险」一节；`flow start` 在付费调用前停下来等确认 |
| **规则靠检查执行** | 能写成测试、CI 或 hook 的规则，就不要只写在文档里 | 体检脚本 `scripts/check.mjs`（`flow check`、会话启动 hook、CI 都跑它）；CI 和 PR 模板；`flow finish` 会问「这次的教训能不能变成一条检查」 |

这三条是从「评测驱动开发」这类做法里取来、按一个人带几个 Agent 的规模简化过的。它们不依赖任何特定的模型或平台。

## 体检脚本检查什么

`scripts/check.mjs` 是一个零依赖的 Node 脚本，只读不写。

| 级别 | 检查 |
| --- | --- |
| 错误 | 缺 `AGENTS.md` / `docs/STATUS.md` / `docs/BOARD.md` |
| 错误 | 还有没替换的 `{{占位符}}` |
| 错误 | 任务板上编号重复 |
| 错误 | `Ready` / `In progress` / `Review` 里的任务找不到说明书（类型为「杂务」的除外） |
| 错误 | `AGENTS.md`、`CLAUDE.md`、`docs/`、`evals/` 里的相对链接指向不存在的文件（区分大小写，避免本机能过、CI 上断；指向项目外的路径不检查） |
| 提醒 | 交接单超过 14 天没更新，或者没写「更新于 YYYY-MM-DD」 |
| 提醒 | 同时进行的任务超过 3 个；`In progress` 没写谁在做；`Done` 没写证据 |
| 提醒 | 说明书对应的任务不在任务板上；`AGENTS.md` 超过 200 行 |

```bash
node scripts/check.mjs /path/to/project --strict
```

有错误时退出码是 1；加 `--strict` 时提醒也算失败；参数写错或脚本自己出错时是 2；`--json` 输出机器可读的结果；`--stale-days N` 和 `--max-in-progress N` 可以调阈值。初始化时它会被复制到项目的 `scripts/kit-check.mjs`，这样项目自己的 CI 也能跑。

## 角色分工

| 角色 | 谁 | 负责 |
| --- | --- | --- |
| 产品负责人 | 你 | 定方向、拍板、验收，提供密钥和硬件 |
| 总控 | 主会话 | 拆任务、写说明书、维护任务板和交接单、合并分支、改共享文件 |
| 执行者 | 任务会话 | 一个任务一个会话、一个分支，只改说明书允许的文件 |
| 专家 | 子代理 | 审查、安全检查、调研，用完即走 |

并行规则：按目录切分，一个文件同一时间只有一个执行者；共享文件只由总控改；同时最多 3 个执行者，因为瓶颈是你审查的速度。

模型按活儿选：写说明书、做架构和评审用最强的模型；按说明书实现用主力编码模型；调研和批量杂活用便宜的模型。

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

装好后重启 Claude Code。以后更新（更新后也要重启）：

```bash
claude plugin marketplace update agent-project-kit
```

## 使用

**1. 给项目初始化一次**（在项目目录里打开会话）：

```text
/agent-project-kit:project-init
```

它会读你的仓库，推断命令、代码地图和共享文件，最多问你 3 个问题，然后生成 `AGENTS.md`、`CLAUDE.md`、`docs/STATUS.md`、`docs/BOARD.md`、`docs/workflow.md` 和几个模板目录，并在任务板上放好起步任务。按项目情况还会装：体检脚本、CI 和 PR 模板（放在 GitHub 上的项目）、`evals/`（调用模型的项目）、执行计划（多阶段的项目）。**已存在的文件不会被覆盖**，也不会自动提交。

**2. 日常使用：**

| 命令 | 做什么 |
| --- | --- |
| `/agent-project-kit:flow next` | 先体检，再读交接单、任务板和执行计划，建议下一步做什么、哪些可以并行 |
| `/agent-project-kit:flow new <想法>` | 把想法写成带验收标准的说明书，放上任务板 |
| `/agent-project-kit:flow start T-xxx` | 开工：检查冲突、建分支、测试先行；有付费调用时先估算、等确认 |
| `/agent-project-kit:flow finish` | 收尾：跑检查、逐条核对验收标准、派审查子代理、把教训变成检查、更新任务板和交接单 |
| `/agent-project-kit:flow handoff` | 会话结束前更新交接单，下一个 Agent 读它就能接上 |
| `/agent-project-kit:flow case <哪里错了>` | 把一次真实出错存成回归用例：代码 bug 写成失败的测试，模型输出的错存进 `evals/cases/` |
| `/agent-project-kit:flow check` | 体检：任务板、说明书、文档链接、交接单是否过期 |

直接用自然语言说也可以，比如「下一步做什么」「开工 T-102」「这次摘要错了，记一条用例」「交接一下」。

**3. 自动的部分：**

- **会话启动 hook**：项目里有 `docs/STATUS.md` 时，每次开会话都会自动把「当前」一节、开放问题、任务板的进行中任务和体检结果注入上下文。其他项目里它不输出任何内容。
- **`vendor-researcher` 子代理**：调研类任务交给它。它只信官方文档，每条结论附出处和日期，只往 `docs/research/` 写。

## 从 0.1 升级

已经用 0.1 初始化过的项目不用重装，文件格式是兼容的。更新插件后：

1. 运行 `/agent-project-kit:flow check`，按结果修一遍。
2. 想要新的可选文件（体检脚本、CI、PR 模板、`evals/`、执行计划、实验模板），再运行一次 `/agent-project-kit:project-init`，它会列出缺的，问你要哪些。
3. 任务板可以手动加一节 `## Voided`，放作废的任务。

## 不用 Claude Code？

这些文件本身就是通用的：

- 把 [`skills/project-init/templates/`](skills/project-init/templates/) 复制到项目根目录，手动替换 `{{占位符}}`。
- `AGENTS.md` 是 Codex、Cursor 等工具都会读的标准文件。
- [`skills/flow/SKILL.md`](skills/flow/SKILL.md) 里的七个动作，可以直接当提示词交给任何 Agent。
- [`scripts/check.mjs`](scripts/check.mjs) 只需要 Node，放进任何 CI 都能跑。

## 目录

```text
.claude-plugin/
├── plugin.json          插件清单
└── marketplace.json     让这个仓库同时作为插件市场，可以直接 /plugin marketplace add
skills/
├── project-init/        初始化 skill
│   └── templates/       装进项目的文件（AGENTS.md、CLAUDE.md、docs/…、evals/…、.github/…）
└── flow/                任务流程 skill（new / next / start / finish / handoff / case / check）
agents/
└── vendor-researcher.md 调研子代理
hooks/
├── hooks.json           SessionStart hook 配置
└── session-start.mjs    注入 STATUS、BOARD 和体检结果（需要 Node.js）
scripts/
└── check.mjs            体检脚本（零依赖）
test/                    插件自己的测试：node --test
.github/workflows/ci.yml 插件自己的 CI：在 Linux 和 Windows 上跑测试
```

## 开发

```bash
node --test
```

这个仓库对自己用同一套纪律：体检脚本、hook 和模板都有测试；模板里的占位符必须和 `project-init` 的说明对得上；模板装进空项目后必须能通过体检；每次推送由 CI 在 Linux 和 Windows 上跑一遍。更新记录见 [CHANGELOG.md](CHANGELOG.md)。

## 要求

- Claude Code（支持插件的版本）
- Node.js 18 以上（启动 hook 和体检脚本要用；没有 Node 时它们不生效，其他功能照常）

## 许可

MIT
