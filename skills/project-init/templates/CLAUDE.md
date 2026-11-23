@AGENTS.md

## Claude 专用

- 团队协作：`assign T-xxx 负责人` 派任务，`inbox 负责人` 查本人负责的任务，`daily` 留下当天的成果、求助和下一步，`weekly` 生成本周回顾。

- 交接与复用：`export <新目录>` 导出，`sync` 同步，`retro T-xxx` 整理复盘，`knowledge <关键词>` 检索经验。已连接时在里程碑同步，在任务收尾时留下复盘。

- 任务流程：`/agent-project-kit:flow`，包括 `new`（想法 → 说明书）、`next`（下一步做什么）、`start T-xxx`、`finish`、`handoff`、`case`（把一次出错存成回归用例）、`check`（体检）。
- 会话启动时，agent-project-kit 的 hook 会自动把 STATUS 的「当前」一节、BOARD 的进行中任务和体检结果注入上下文。
- 调研任务派 `vendor-researcher` 子代理，结果写进 `docs/research/`。
- 改完代码派审查子代理（例如 `code-reviewer`）；碰到密钥、外部 API、用户输入时再派 `security-reviewer`。
- 一个任务一个会话、一个 worktree。互相独立的任务可以并行开，同时最多 3 个。
- 按活儿选模型：写说明书、做架构和评审用最强的模型；按说明书实现用主力编码模型；调研和批量杂活用便宜的模型。
