# Agent UI Interaction Protocol

## 目标

应用层不直接绑定某个 Agent 实现，而是消费一组稳定事件：

1. `Agent Flow`：中间区域展示 Agent 正在做什么。
2. `Artifact`：Agent 产生的可引用产物。
3. `Sandbox`：右侧可预览、可接管、可审批的执行环境。

## Agent Flow

中间区域按时间顺序展示 flow event。常见类型：

- `status`：运行开始、完成、失败、暂停。
- `thought`：可展示的思考摘要，不展示原始 chain-of-thought。
- `summary`：阶段总结、结果摘要、下一步说明。
- `todo`：任务拆解、todo 创建、todo 更新、todo 完成。
- `tool`：工具调用开始、参数摘要、工具结果摘要。
- `sandbox`：浏览器、文件编辑器、终端、预览窗口等沙箱状态变化。
- `approval`：需要用户审批、登录、接管、确认高风险操作。
- `artifact`：产生一个可引用产物。
- `assistant_message`：最终或阶段性自然语言回复。
- `error`：错误、重试、降级说明。

每条 flow event 都应该包含：

- `id`
- `runId`
- `type`
- `flowKind`
- `title`
- `detail`
- `status`
- `visibility`
- `actions`
- `payload`
- `createdAt`
- `sequence`

`visibility` 用于控制展示层：

- `primary`：默认展示在中间主流程。
- `secondary`：低调展示，适合系统状态和简短思考摘要。
- `debug`：调试模式展示。
- `internal`：仅持久化，不直接展示。

## Artifact

Artifact 是 Agent 与 UI 的交换产物，不等于“必须右侧预览”。

Artifact 常见类型：

- `text`
- `markdown`
- `code`
- `html`
- `image`
- `pdf`
- `slides`
- `table`
- `chart`
- `json`
- `file`

每个 artifact 自带 `display` 字段决定展示方式：

- `inline`：直接在中间 flow 中展示，例如图片、小型图表。
- `button`：在中间展示小按钮，用户点击后执行 action。
- `preview`：在中间展示小按钮，点击后在右侧 sandbox/preview 打开。
- `download`：作为文件下载或导出入口。
- `hidden`：只作为内部上下文或后续工具输入。

不要用 artifact 类型硬编码展示策略。例如 `markdown` 可以是内部分析，也可以是最终报告；`json` 可以是内部结构，也可以是用户要看的 API 输出。展示策略由 `display` 决定。

## Sandbox

右侧区域不是 artifact 列表，而是当前可操作环境：

- 浏览器接管和登录。
- HTML、slides、text、code 等可预览产物。
- 文件编辑器。
- 命令执行状态。
- 审批、接管、停止等操作。

右侧默认展示 sandbox 状态。只有当 flow event 的 action 指向某个 previewable artifact 时，才打开对应预览。

## 常见 Agent UI 借鉴

- Manus 类产品强调“电脑/沙箱”可见，用户可接管浏览器、文件和长任务。
- Codex/Claude Code 类产品强调 tool call、审批、diff、命令输出、todo 和阶段总结。
- 多数 Agent 产品都会区分原始思考和可展示思考摘要，产品层只展示安全的 `thought summary`。

因此当前页面基础应是：

```text
left:   task entry + theme
center: agent flow
right:  sandbox / preview / takeover actions
```
