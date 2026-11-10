---
name: project-init
description: 给当前项目搭建「一个人 + 多个 Agent」的项目基础设施：AGENTS.md、CLAUDE.md、docs/STATUS.md（交接单）、docs/BOARD.md（任务板）、说明书、ADR、调研笔记和实验模板、工作方式说明，以及可选的执行计划、回归用例目录（evals）、CI 和 PR 模板、体检脚本。用户说「初始化项目基础设施」「给这个项目建 AGENTS.md / STATUS / BOARD」「用 agent-project-kit 初始化」「项目怎么记录、多 agent 怎么分工」时使用。
argument-hint: "[项目目录，默认为当前目录]"
---

# project-init

把 `templates/` 里的文件装进目标项目，并按项目实际情况填好。方法论见 `templates/docs/workflow.md`。

## 1. 先看现状，不要覆盖

目标目录默认是当前项目根目录（有参数时用参数）。逐个检查这些文件是否已存在：`AGENTS.md`、`CLAUDE.md`、`docs/STATUS.md`、`docs/BOARD.md`、`docs/workflow.md`、`docs/specs/`、`docs/adr/`、`docs/research/`、`docs/experiments/`、`docs/plan/`、`evals/`、`.github/workflows/`、`.github/pull_request_template.md`、`scripts/kit-check.mjs`。

- **已存在的文件一律不覆盖。** `CLAUDE.md` 已存在时，只在文件顶部加一行 `@AGENTS.md`（已经有了就跳过），再把模板里「Claude 专用」一节追加到末尾。其他已存在的文件，列给用户看，问是否要合并。
- `docs/` 下已有同名目录（比如已经有 `docs/adr/`），沿用原目录，只补模板文件。
- 项目已有 CI 配置（`.github/workflows/` 里有文件，或者用的是别的 CI）时，不新建 `ci.yml`，只告诉用户可以在现有 CI 里加一步 `node scripts/kit-check.mjs`。
- 如果项目已经完整装过一次（`AGENTS.md` 和 `docs/STATUS.md` 都在），告诉用户已经初始化过，改用 `/agent-project-kit:flow`（想补装新版本增加的可选文件，逐个列出缺的，问用户要哪些），然后停止。

## 2. 了解项目（自己查，少问人）

从仓库里推断，不要凭空编：

| 要填的 | 去哪找 |
| --- | --- |
| 项目一句话 | README、package.json / pyproject.toml / Cargo.toml / go.mod 的 description |
| 命令 | package.json 的 scripts、Makefile、pyproject、justfile、CI 配置 |
| 完成的定义 | 类型检查、lint、测试命令（找到几个写几个） |
| 代码地图 | 顶层目录和 `src/` 下一层，每项一句话职责；项目很小时直接列关键文件 |
| 共享文件 | 入口文件、配置结构、数据库迁移、依赖清单（package.json / lockfile 等）、CI 配置 |
| 架构文档 | 已有 `docs/architecture.md`、`ARCHITECTURE.md` 或类似文件时引用它，没有就写「暂无」 |
| 环境事实 | 语言和运行时版本、包管理器、是否 git 仓库、有无远程仓库、有无 CI |
| 命令能否运行 | 命令依赖的工具是否已声明（例如 scripts 用到 `vitest`，devDependencies 里有没有）。缺依赖时把命令照样写进 AGENTS.md，在 STATUS 的「已知的坑」里注明「暂时无法运行，原因……」，并播种一个修复任务 |
| 是否调用模型或付费服务 | 依赖清单里有没有模型或云服务的 SDK，代码里有没有调用它们的地方，`.env.example` 里有没有对应的密钥名 |
| 是否多阶段 | README 或已有文档里有没有路线图、里程碑、阶段划分 |

推断不出来、又会影响后续工作的，最多问用户 **3 个问题**，一次问完。典型的问题是：项目要做成什么、分几条主线或几个阶段、有哪些不能碰的硬性规则。空项目（几乎没有代码）时，这 3 个问题必问。3 个之外的次要问题不问用户，直接写进 STATUS 的「开放问题」。用户不在场（非交互运行）时，这 3 个问题也写进「开放问题」。

## 3. 生成文件

把 `templates/` 下的文件复制到目标项目对应位置（`templates/AGENTS.md` → `AGENTS.md`，`templates/docs/STATUS.md` → `docs/STATUS.md`，以此类推），再替换 `{{占位符}}`。

**每个项目都装：**`AGENTS.md`、`CLAUDE.md`、`docs/STATUS.md`、`docs/BOARD.md`、`docs/workflow.md`，以及 `docs/specs/`、`docs/adr/`、`docs/research/`、`docs/experiments/` 下的 `_TEMPLATE.md`。

**按情况装：**

| 文件 | 什么时候装 |
| --- | --- |
| `scripts/kit-check.mjs` | 机器上有 Node 时装。来源不在 `templates/` 里，而是插件根目录的 `scripts/check.mjs`（`${CLAUDE_SKILL_DIR}/../../scripts/check.mjs`，即本 skill 目录往上两级），原样复制并改名。装了之后在 `{{COMMANDS}}` 里加一行 `node scripts/kit-check.mjs   # 体检：任务板、说明书、文档链接` |
| `.github/workflows/ci.yml` | 项目是 git 仓库、打算放在 GitHub 上、还没有 CI 时装。没装体检脚本时，删掉文件里的 `kit-check` 这个 job |
| `.github/pull_request_template.md` | 和 `ci.yml` 一起装 |
| `evals/README.md`、`evals/cases/_TEMPLATE.md` | 项目调用模型时装（见第 2 步的判断）。不确定就不装，以后第一次运行 `flow case` 时会补上 |
| `docs/plan/exec-plan.md` | 项目分成两个以上阶段时装，并按实际情况填写分工、依赖关系、阶段和待拍板的决定；不要留着模板里的示例行。单阶段的小项目不装 |

含占位符的文件只有四个：`AGENTS.md`、`docs/STATUS.md`、`docs/BOARD.md`、`.github/workflows/ci.yml`。其余文件原样复制（`docs/plan/exec-plan.md` 是照着模板的结构直接写内容）。

| 文件 | 占位符 | 填什么 |
| --- | --- | --- |
| AGENTS.md | `{{PROJECT_ONE_LINER}}` | 一两句话：项目做什么、技术栈、运行环境 |
| | `{{ARCHITECTURE_DOC}}` | 架构文档的路径（用反引号包起来），没有就写「`docs/architecture.md`（待写）」 |
| | `{{COMMANDS}}` | 每行一条命令，后面用 `#` 注释说明用途 |
| | `{{DONE_CHECKS}}` | 例如「`npm run typecheck`、`npm test` 和 `node scripts/kit-check.mjs`」 |
| | `{{PROJECT_RULES}}` | 项目特有的硬性规则，每条一行，以 `- **规则**：说明` 开头；能被机器检查的，在后面注明「（由 xxx 检查）」。没有就连同这一行一起删掉。项目调用模型或付费服务时，加上下面「调用模型的项目」里的三条 |
| | `{{CODE_MAP}}` | 表格行：`` | `src/xxx/` | 职责 | 主线 | ``。还没有主线划分时，最后一列写「未定」 |
| | `{{SHARED_FILES}}` | 用反引号列出共享文件 |
| STATUS.md | `{{CURRENT_PHASE}}` | 当前阶段；还没开始的写「刚初始化」 |
| | `{{WORKING}}` | 已经能用的功能；没有就写「暂无」 |
| | `{{NOT_DONE}}` | 计划中还没做的主要部分 |
| | `{{NEXT}}` | BOARD 上排在最前面的 Ready 任务编号 |
| | `{{ENVIRONMENT}}` | 表格行：`` | 项 | 值 | `` |
| | `{{OPEN_QUESTIONS}}` | 还没得到回答的问题，编号列出；没有就写「暂无」 |
| | `{{DATE}}` / `{{AUTHOR}}` | 今天的日期（YYYY-MM-DD）/ 「初始化（Claude）」 |
| BOARD.md | `{{ID_SCHEME}}` | 任务编号规则。有主线时，例如「T-0xx 杂务，T-1xx 主线一，T-2xx 主线二」；没有主线就写「T-001 起按顺序编号」 |
| ci.yml | `{{CI_SETUP}}` | 装运行环境的步骤，缩进 6 个空格，和上一行的 `- uses: actions/checkout` 对齐。例如 Node 项目：`- uses: actions/setup-node@v7`，带 `node-version` 和 `cache`，再加一步 `- run: npm ci`。版本号以项目实际使用的为准 |
| | `{{CI_CHECKS}}` | 「完成的定义」里的每条检查各一步：`- run: npm run typecheck`、`- run: npm test`。不要把体检脚本写在这里，它有单独的 job。需要密钥或会花钱的命令不放进 CI |

**调用模型的项目**，在 `{{PROJECT_RULES}}` 里加这三条（「追踪记录的位置」按项目实际情况写，还没有就写「待定，见 T-xxx」并播种一个任务）：

```markdown
- **模型调用都留追踪**：每次调用记录模型、提示词版本、输入输出 token、费用、耗时和结果，写到 <追踪记录的位置>。字段见 `evals/README.md`。
- **花钱先估算**：付费调用第一次真实运行前，先给出估算（次数 × 单价），得到人的确认。常规测试和 CI 不做真实调用。
- **提示词是代码**：提示词放在文件里、带版本号。改提示词或换模型之前和之后，都跑一遍 `evals/cases/` 里的用例。
```

生成之后，运行体检脚本确认没有遗漏的占位符和断掉的链接（没有 Node 时改用 Grep 搜 `{{`）：

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/check.mjs" <项目目录>
```

错误要清零再往下走。

**小项目精简模式**：源代码少于 10 个文件、只有一个人、没有并行需求时，在 AGENTS.md「协作流程」末尾加一句：「本项目目前是精简模式：不强制 worktree 和并行会话，任务直接在主分支上按顺序完成；BOARD 只用 Ready / In progress / Done 三栏也可以。」等项目变大以后再删掉这句。

## 4. 播种任务板

根据第 2 步了解到的情况，往 `docs/BOARD.md` 里放 3～8 个起步任务（不含下面的 T-000）：

- 能马上开工、目标明确的任务放进 `Ready`，并用 `docs/specs/_TEMPLATE.md` 写好说明书。最多写 2 份，其余的先放 `Inbox`。体检脚本会检查 `Ready` 里的任务有没有说明书，所以没写说明书的不要放进 `Ready`。
- 需要用户本人操作的事（配置账号、提供密钥、买硬件、第一次提交和建远程仓库）也作为任务列出，「类型」列写「杂务」，并在任务名后注明「（需要你本人）」。杂务不需要说明书。
- 已经完成的工作（项目里已有的代码）记为一条 `T-000`，放进 `Done`，「证据」写现有的测试结果或「初始化前已有」，方便追溯。T-000 固定留给这条记录，起步任务从 T-001（或主线的第一个编号）开始。
- **只改共享文件的任务**（加依赖、建配置、加迁移）在说明书「允许改动」里写「由总控执行」，直接列出这些共享文件。这不违反「共享文件只由总控修改」，因为执行它的就是总控会话。项目刚起步时这类任务很常见。
- 装了 `ci.yml` 但项目还没有远程仓库时，播种一条杂务：「建远程仓库并开启分支保护（需要你本人）」。

## 5. 收尾

1. 确认 `.gitignore` 里忽略了 `.env`。没有的话，提醒用户，不要擅自修改。
2. 再跑一次体检脚本，把结果告诉用户。
3. 不要自动提交，也不要推送。
4. 在对话里（不是写进文件）用三五句话告诉用户：
   - 文件放在哪里，每个文件的作用是什么（一个文件一句话）；哪些可选文件没装、为什么；
   - 日常怎么用：`/agent-project-kit:flow next` 看下一步，`flow new <想法>` 加任务，`flow start T-xxx` 开工，`flow finish` 收尾，`flow handoff` 结束前交接，`flow case` 把一次出错存成回归用例，`flow check` 体检；
   - STATUS 里有哪些开放问题等他拍板。
