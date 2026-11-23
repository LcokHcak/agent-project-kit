# agent-project-kit

[![ci](https://github.com/LcokHcak/agent-project-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/LcokHcak/agent-project-kit/actions/workflows/ci.yml)

**把任务派给人或 AI，让下一位接手的人知道已经做了什么、证据在哪里、还需要谁帮忙。** Agent Project Kit 把任务板、日报、周报和复盘保存在项目自己的 Markdown 文件里。你可以独自用，也可以让同事在另一台电脑用 Claude Code 或 Codex 接着做。

## 团队一周怎么用

| 场景 | 在项目里说 | 接下来会看到什么 |
| --- | --- | --- |
| 个人安排今天的工作 | `flow inbox 小林` | 列出小林待开工、进行中和待验收的任务，打开说明书就能找到交付条件。 |
| 把任务交给同事或 Agent | `flow assign T-102 小周` | 任务板记下负责人，小周的收件箱出现 T-102。开工与验收各有自己的状态。 |
| 每人写当天进展 | `flow daily`，附上结果、证据、需要谁帮忙和下一步 | 每人每天一份记录。已开同步的成员能看到对方的求助，分别编辑自己的文件。 |
| 周五一起复盘 | `flow weekly 2026-11-27` | 汇总当周日报，按成果、求助和每个人最后填报的下一步排列。每条可以点回原文；会后继续派单。 |

### 运行三个使用场景

克隆本仓库后，从仓库根目录运行下面的示例。需要 Node.js 18 或以上，目标目录须尚不存在。

```sh
node examples/team-week.mjs ./demo-week
```

示例用一个虚构读书会演示三个场景。**个人**先写报名须知，留下等待场地确认的事项。**两人协作**时，小周收到报名演练任务，在日报里请小林调整取消入口。**周回顾和换人**时，负责人能在周报里看到两人的记录，并把交接目录带走。它会生成真实文件，可继续运行下面的命令查看结果。

```sh
cd demo-week
node scripts/kit-team.mjs inbox 小周
node scripts/kit-team.mjs weekly 2026-11-27
node scripts/kit-handoff.mjs export ../next-organizer
```

### 同类工具各自擅长什么

| 工具 | 官方工作流的侧重点 | 项目里适合采用的场景 |
| --- | --- | --- |
| **Agent Project Kit** | 项目共享任务板、按负责人派单、日报汇总、可离线编辑的交接包，以及可检索的任务复盘。 | 多个成员轮流接手，周会上需要从结论追到具体任务和当天的原始记录。 |
| **GitHub Spec Kit** | 从需求规格走到计划、任务、实现和核对，提供可定制的开发流程。[官方仓库](https://github.com/github/spec-kit) | 大功能开工前，希望把用户需求和验收标准写清楚。 |
| **OpenSpec** | 围绕一项变更组织提案、规格与实施，完成后归档。[官方仓库](https://github.com/Fission-AI/OpenSpec) | 已有产品要改变行为，需要讨论提案、保留生效的规格。 |
| **Superpowers** | 把设计、实施计划、测试驱动开发和代码审查组织成 Agent 技能。[官方仓库](https://github.com/obra/superpowers) | 工程任务已经明确，需要带着 Agent 分步实现、测试和审查。 |

我们的优势在日常沟通成本上。周五有人问“报名页卡在哪里”，团队可以从周报点回小周的原话，再去任务板看负责人。换成其他协作工具处理规格或写代码时，可以把对应文档、测试和 PR 链回同一任务。上表比较工作流；没有做效率跑分。

## 在不同项目使用

**Claude Code** 安装一次，在每个需要管理的项目根目录运行 `/agent-project-kit:project-init`。已有记录的项目可以沿用任务板和交接单。

**Codex** 克隆插件后执行以下命令。安装器把用户级技能链接到当前克隆。保留该目录，更新时在其中拉取新版本。然后在任意项目的新会话说“用 agent-project-kit 初始化这个项目”。

```sh
git clone https://github.com/LcokHcak/agent-project-kit.git
cd agent-project-kit
node scripts/install-codex.mjs
```

**已有项目升级**时，把新版 `scripts/check.mjs`、`scripts/handoff.mjs`、`scripts/team.mjs` 分别更新到项目内的 `scripts/kit-check.mjs`、`scripts/kit-handoff.mjs`、`scripts/kit-team.mjs`。旧任务板在首次派单时会补上负责人列。每个项目独立决定是否启用 Git 同步；启用时为每个项目使用独立的远程仓库，团队成员连接同一项目的仓库。收件箱来自任务板，日报和周报在调用时生成；外部聊天通知和定时提醒需要另外接入。

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
- [`skills/flow/SKILL.md`](skills/flow/SKILL.md) 里的任务和交接流程可以直接交给其他 Agent。
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

## 跨电脑协作与任务复盘（0.3）

在项目根目录执行。初始化会安装零依赖的 Node 脚本 `scripts/kit-handoff.mjs`。旧项目可直接从插件复制 `scripts/handoff.mjs` 到上述位置。

| 工作 | 操作 |
| --- | --- |
| 离线导出 | `flow export <新目录>` 生成可编辑的 Markdown 目录、入口 HANDOFF.md、经验索引和可再导出的脚本。包里注明本地代码 HEAD；源码、音频、附件和会话原文须另行交接。 |
| 离线交回 | 在目标项目根运行 `node scripts/kit-handoff.mjs restore <交接目录>`。按导出基线合并文档，双方修改同一文件时先列出冲突。已导出的目录可以再次导出，同时保留最初基线。 |
| 实时共享 | 每位成员在自己的项目 Git 根目录执行 `node scripts/kit-handoff.mjs connect <remote名称>`，再运行 `node scripts/kit-handoff.mjs watch`。脚本每轮完成后等 15 秒再次同步，Ctrl+C 停止。一次同步用 `flow sync`。 |
| 任务复盘 | `flow finish` 时生成报告；随时可用 `flow retro T-101` 补充已验证的经验。报告是可编辑的 `docs/retros/T-101.md`，按任务编号保存。 |
| 经验复用 | `flow knowledge 断网` 从所有复盘的当前内容检索。CLI 对应 `node scripts/kit-handoff.mjs knowledge 断网`。 |

**共享范围。** 独立的 Git 分支 `agent-project-kit-handoff` 保存文档快照，和产品分支有独立的提交历史。两端需要能读写同一 Git 仓库。可以用本机或局域网内的 bare 仓库验证，也可以显式选定团队私有 remote。首次连接只保存选择。只在运行 sync、watch 或已连接的技能执行同步时传输。共享范围包括 AGENTS、STATUS、BOARD、ROADMAP、workflow 和 specs、adr、plan、retros、review、research、experiments、evals/cases、lab/cases 中的 Markdown。目标分支的读者均能阅读这些记录，请按项目读者范围选择 remote。

**切换和冲突。** 不同文档的修改自动合并；两人改同一文档时会列出路径并暂停写入项目。用 `incoming <新目录>` 查看对端，按提示执行 `resolve local|remote <标识>` 选择要保留的一版。需要融合两版时编辑本地文件，重新 sync 获取对应标识，再选择 local。变动过的冲突标识会失效。断线时本地文件仍能编辑，watch 在下一轮重试。历史记录用文档内的「作废／归档」标记；单端移走文档后，同步会从其他快照补回。源码、工作树、暂存区和业务分支由项目原有的 Git 流程管理。

**换会话。** 启动时读 STATUS、BOARD 和近期复盘。开工前检索同类经验；每完成一项验收就把证据和接续点写入对应说明书，阶段结束再总结。项目已连接时按技能流程同步；两台电脑持续联网并运行 watch 时，保存的记录会自动传到对端。
