@AGENTS.md

## Claude 专用

- 任务流程：`/agent-project-kit:flow`，包括 `new`（想法 → 说明书）、`next`（下一步做什么）、`start T-xxx`、`finish`、`handoff`。
- 会话启动时，agent-project-kit 的 hook 会自动把 STATUS 的「当前」一节和 BOARD 的进行中任务注入上下文。
- 调研任务派 `vendor-researcher` 子代理，结果写进 `docs/research/`。
- 改完代码派审查子代理（例如 `code-reviewer`）；碰到密钥、外部 API、用户输入时再派 `security-reviewer`。
- 一个任务一个会话、一个 worktree。互相独立的任务可以并行开，同时最多 3 个。
