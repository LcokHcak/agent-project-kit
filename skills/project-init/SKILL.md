---
name: project-init
description: 给当前项目搭建「一个人 + 多个 Agent」的项目基础设施：AGENTS.md、CLAUDE.md、docs/STATUS.md（交接单）、docs/BOARD.md（任务板）、说明书、ADR、调研笔记模板和工作方式说明。用户说「初始化项目基础设施」「给这个项目建 AGENTS.md / STATUS / BOARD」「用 agent-project-kit 初始化」「项目怎么记录、多 agent 怎么分工」时使用。
argument-hint: "[项目目录，默认为当前目录]"
---

# project-init

把 `templates/` 里的文件装进目标项目，并按项目实际情况填好。方法论见 `templates/docs/workflow.md`。

## 1. 先看现状，不要覆盖

目标目录默认是当前项目根目录（有参数时用参数）。逐个检查这些文件是否已存在：`AGENTS.md`、`CLAUDE.md`、`docs/STATUS.md`、`docs/BOARD.md`、`docs/workflow.md`、`docs/specs/`、`docs/adr/`、`docs/research/`。

- **已存在的文件一律不覆盖。** `CLAUDE.md` 已存在时，只在文件顶部加一行 `@AGENTS.md`（已经有了就跳过），再把模板里「Claude 专用」一节追加到末尾。其他已存在的文件，列给用户看，问是否要合并。
- `docs/` 下已有同名目录（比如已经有 `docs/adr/`），沿用原目录，只补模板文件。
- 如果项目已经完整装过一次（`AGENTS.md` 和 `docs/STATUS.md` 都在），告诉用户已经初始化过，改用 `/agent-project-kit:flow`，然后停止。

## 2. 了解项目（自己查，少问人）

从仓库里推断，不要凭空编：

| 要填的 | 去哪找 |
| --- | --- |
| 项目一句话 | README、package.json / pyproject.toml / Cargo.toml / go.mod 的 description |
| 命令 | package.json 的 scripts、Makefile、pyproject、justfile、CI 配置 |
| 完成的定义 | 类型检查、lint、测试命令（找到几个写几个） |
| 代码地图 | 顶层目录和 `src/` 下一层，每项一句话职责；项目很小时直接列关键文件 |
| 共享文件 | 入口文件、配置结构、数据库迁移、依赖清单（package.json / lockfile 等） |
| 架构文档 | 已有 `docs/architecture.md`、`ARCHITECTURE.md` 或类似文件时引用它，没有就写「暂无」 |
| 环境事实 | 语言和运行时版本、包管理器、是否 git 仓库、有无远程仓库 |
| 命令能否运行 | 命令依赖的工具是否已声明（例如 scripts 用到 `vitest`，devDependencies 里有没有）。缺依赖时把命令照样写进 AGENTS.md，在 STATUS 的「已知的坑」里注明「暂时无法运行，原因……」，并播种一个修复任务 |

推断不出来、又会影响后续工作的，最多问用户 **3 个问题**，一次问完。典型的问题是：项目要做成什么、分几条主线或几个阶段、有哪些不能碰的硬性规则。空项目（几乎没有代码）时，这 3 个问题必问。3 个之外的次要问题不问用户，直接写进 STATUS 的「开放问题」。用户不在场（非交互运行）时，这 3 个问题也写进「开放问题」。

## 3. 生成文件

把 `templates/` 下的文件复制到目标项目对应位置（`templates/AGENTS.md` → `AGENTS.md`，`templates/docs/STATUS.md` → `docs/STATUS.md`，以此类推），再替换 `{{占位符}}`。只有三个文件含占位符：`AGENTS.md`、`docs/STATUS.md`、`docs/BOARD.md`。其余文件（`CLAUDE.md`、`docs/workflow.md`、三个 `_TEMPLATE.md`）原样复制。

| 文件 | 占位符 | 填什么 |
| --- | --- | --- |
| AGENTS.md | `{{PROJECT_ONE_LINER}}` | 一两句话：项目做什么、技术栈、运行环境 |
| | `{{ARCHITECTURE_DOC}}` | 架构文档的路径（用反引号包起来），没有就写「`docs/architecture.md`（待写）」 |
| | `{{COMMANDS}}` | 每行一条命令，后面用 `#` 注释说明用途 |
| | `{{DONE_CHECKS}}` | 例如「`npm run typecheck` 和 `npm test`」 |
| | `{{PROJECT_RULES}}` | 项目特有的硬性规则，每条一行，以 `- **规则**：说明` 开头。没有就连同这一行一起删掉 |
| | `{{CODE_MAP}}` | 表格行：`` | `src/xxx/` | 职责 | 主线 | ``。还没有主线划分时，最后一列写「未定」 |
| | `{{SHARED_FILES}}` | 用反引号列出共享文件 |
| STATUS.md | `{{CURRENT_PHASE}}` | 当前阶段；还没开始的写「刚初始化」 |
| | `{{WORKING}}` | 已经能用的功能；没有就写「暂无」 |
| | `{{NOT_DONE}}` | 计划中还没做的主要部分 |
| | `{{NEXT}}` | BOARD 上排在最前面的 Ready 任务编号 |
| | `{{ENVIRONMENT}}` | 表格行：`` | 项 | 值 | `` |
| | `{{OPEN_QUESTIONS}}` | 还没得到回答的问题，编号列出；没有就写「暂无」 |
| | `{{DATE}}` / `{{AUTHOR}}` | 今天的日期 / 「初始化（Claude）」 |
| BOARD.md | `{{ID_SCHEME}}` | 任务编号规则。有主线时，例如「T-0xx 杂务，T-1xx 主线一，T-2xx 主线二」；没有主线就写「T-001 起按顺序编号」 |

生成之后，用 Grep 搜 `{{`，确认没有遗漏的占位符。

**小项目精简模式**：源代码少于 10 个文件、只有一个人、没有并行需求时，在 AGENTS.md「协作流程」末尾加一句：「本项目目前是精简模式：不强制 worktree 和并行会话，任务直接在主分支上按顺序完成；BOARD 只用 Ready / In progress / Done 三栏也可以。」等项目变大以后再删掉这句。

## 4. 播种任务板

根据第 2 步了解到的情况，往 `docs/BOARD.md` 里放 3～8 个起步任务（不含下面的 T-000）：

- 能马上开工、目标明确的任务放进 `Ready`，并用 `docs/specs/_TEMPLATE.md` 写好说明书。最多写 2 份，其余的先放 `Inbox`。
- 需要用户本人操作的事（配置账号、提供密钥、买硬件）也作为任务列出，「类型」列写「杂务」，并在任务名后注明「（需要你本人）」。
- 已经完成的工作（项目里已有的代码）记为一条 `T-000`，放进 `Done`，方便追溯。T-000 固定留给这条记录，起步任务从 T-001（或主线的第一个编号）开始。
- **只改共享文件的任务**（加依赖、建配置、加迁移）在说明书「允许改动」里写「由总控执行」，直接列出这些共享文件。这不违反「共享文件只由总控修改」，因为执行它的就是总控会话。项目刚起步时这类任务很常见。

## 5. 收尾

1. 确认 `.gitignore` 里忽略了 `.env`。没有的话，提醒用户，不要擅自修改。
2. 不要自动提交。
3. 在对话里（不是写进文件）用三五句话告诉用户：
   - 文件放在哪里，每个文件的作用是什么（一个文件一句话）；
   - 日常怎么用：`/agent-project-kit:flow next` 看下一步，`flow new <想法>` 加任务，`flow start T-xxx` 开工，`flow finish` 收尾，`flow handoff` 结束前交接；
   - STATUS 里有哪些开放问题等他拍板。
