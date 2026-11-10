# 更新记录

## 0.2.0（2026-11-10）

在「仓库即共享记忆」之外，加上三条工程纪律：出过的错都变成用例、每次模型调用都留痕、规则靠检查执行。

### 新增

- **体检脚本 `scripts/check.mjs`**：零依赖的 Node 脚本，检查必需文件、没替换的占位符、任务板编号重复、`Ready` / `In progress` / `Review` 的任务有没有说明书、文档里的相对链接（区分大小写）；提醒交接单过期、同时进行的任务过多、`In progress` 没写谁在做、`Done` 没写证据、说明书不在任务板上、`AGENTS.md` 过长。支持 `--strict`、`--json`、`--stale-days`、`--max-in-progress`；写错的参数会报错（退出码 2），不会悄悄通过。指向项目外的链接不检查，也不访问。
- **`flow case`**：把一次真实出错存成回归用例。代码 bug 写成失败的测试，模型输出的错存进 `evals/cases/`。
- **`flow check`**：运行体检并按结果修正。
- **新模板**：`evals/README.md` 和 `evals/cases/_TEMPLATE.md`（回归用例和调用追踪的字段）、`docs/experiments/_TEMPLATE.md`（判定标准先于实验）、`docs/plan/exec-plan.md`（多阶段项目的执行计划）、`.github/workflows/ci.yml`、`.github/pull_request_template.md`。
- **插件自己的测试和 CI**：`node --test`，覆盖体检脚本、启动 hook、模板和说明的一致性；CI 在 Linux 和 Windows 上运行。

### 变更

- **会话启动 hook** 现在会附上体检结果。
- **`flow next`** 先体检，并读取执行计划；会建议每个任务用哪一档模型。
- **`flow start`** 在付费调用前要求估算和确认，并要求留下调用追踪。
- **`flow finish`** 增加一步：这次的教训能不能变成一条机器检查；收尾前体检必须没有错误；有远程仓库时走 PR 和 CI。
- **`flow handoff`** 用体检结果核对任务板。
- **`AGENTS.md` 模板** 增加两条硬性规则（出错先留用例、规则靠检查执行）和「记教训」一步。
- **说明书模板** 增加「花费与风险」一节；「结果」里增加回归用例和实际花费；类型增加「实验」。
- **任务板模板** 增加 `Voided` 一节。
- **`project-init`** 按项目情况选装体检脚本、CI、PR 模板、`evals/` 和执行计划；调用模型的项目会写入三条规则（调用留追踪、花钱先估算、提示词是代码）。
- **`workflow.md`** 增加「三条工程纪律」「计划和实验」「用 GitHub 时」三节。

### 兼容性

0.1 初始化的项目不需要迁移。升级步骤见 README 的「从 0.1 升级」。

## 0.1.0（2026-11-09）

第一个版本：`project-init` 和 `flow`（new / next / start / finish / handoff）两个 skill、`vendor-researcher` 子代理、SessionStart hook，以及 AGENTS.md、STATUS、BOARD、说明书、ADR、调研笔记模板。
