# Agent 运行时架构设计

## Agent 运行时目标

- 执行前端已经选定的单个 Skill。当前阶段不在 runtime 内做多 skill 选择。
- 渐进式披露 Skill：运行入口加载选定 `SKILL.md`，执行过程中只允许按需读取当前 skill 的引用资源。
- 使用 JSON Todos 管理任务计划和状态。
- LLM Provider 独立封装，默认从环境变量选择 OpenRouter。Agent Run 严格假设 LLM 已配置；未配置时运行失败，不再走 mock 流程。
- 大部分操作通过 Sandbox 类工具执行。第一阶段使用本地 Sandbox，后续再替换为 ByteCloud Sandbox adapter。
- 向应用层持续输出稳定的 Agent Flow / Artifact / Sandbox 事件。

## Skill Spec

Skill 完全遵循社区主流规范。每个 Skill 是一个目录，核心只有 `SKILL.md`，其它文件都由 `SKILL.md` 引用。

```text
skill-name/
├── SKILL.md
├── references/
├── scripts/
├── assets/
```

Runtime 不要求私有 manifest。`SkillRegistry` 只扫描目录、读取指定 `SKILL.md`、解析标准 frontmatter 或正文摘要。

## 工具定义

Agent 执行过程中只能通过工具产生外部影响。Sandbox 不作为顶层独立模块暴露，而是放在 `tools/sandbox` 内部，作为命令、文件、浏览器、截图、代码执行等工具的执行环境。

## LLM Provider 设计

LLM 是 Agent 的推理与规划依赖，不直接塞进 Orchestrator 细节里。Runtime 只依赖统一接口：

```ts
interface LlmProvider {
  readonly id: "openrouter" | "none";
  readonly model: string;
  getStatus(): LlmProviderStatus;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}
```

当前实现：

- `createLlmProviderFromEnv`：从环境变量选择 provider。
- `OpenAiCompatibleProvider`：基于官方 `openai` SDK，通过 `baseURL` 适配 OpenAI-compatible API。
- `OpenRouterProvider`：读取 `OPENROUTER_API_KEY`、`OPENROUTER_MODEL`、`OPENROUTER_BASE_URL`，本质上是 `OpenAiCompatibleProvider` 的配置封装。
- `model-catalog`：提供 OpenRouter 候选模型目录，当前包含 `moonshotai/kimi-k2.6`、`deepseek/deepseek-v4-flash`、`deepseek/deepseek-v4-pro`、`z-ai/glm-5.1`、`x-ai/grok-4.3`，默认 `moonshotai/kimi-k2.6`。
- `/api/llm/models`：向应用层暴露当前模型、默认模型和候选模型列表。创建 run 时允许传入候选模型 ID 覆盖本次运行模型。
- `NoopLlmProvider`：没有密钥时的占位 provider。Agent Run 会在启动阶段检测到未配置并失败，避免执行无意义 mock。

Provider 支持 OpenAI tools/function calling。Agent loop 将注册工具转换为 LLM tool definitions，由模型决定下一步是回复还是调用工具。

### Todo 工具

只暴露一个工具：

```text
write_todos
```

`write_todos` 提交当前完整 todo list 的最新快照。Runtime 内部负责 diff，映射成 `todo.created` / `todo.updated` 事件。

Todo 表达计划状态和轻量产物引用，不承载完整 output、context、artifact 内容：

```ts
type Todo = {
  id: string;
  title: string;
  description: string;
  expectedOutput: string;
  detail?: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  outputSummary?: string;
  artifactRefs?: string[];
  sandboxRefs?: string[];
};
```

### Skill 工具

- `read_skill_file`

`read_skill_file` 只能读取本次 run 已选定 skill 目录内部的 `SKILL.md` 或被引用资源，禁止路径逃逸。模型不能在 runtime 内切换 skill。

### 本地 Sandbox 工具

- `read_file`
- `write_file`
- `patch_file`
- `execute_command`
- `execute_code`
- `browser_navigate`
- `browser_screenshot`

第一阶段这些工具由 `LocalSandboxAdapter` 执行。后续接 ByteCloud 时保持工具名和 UI 协议不变，只替换 adapter。

### Artifact 工具

- `create_artifact`

Artifact 是独立产物，完整内容仍由 artifact registry / sandbox / trace 承载。Todo 只保存轻量 `artifactRefs` / `sandboxRefs`，用于状态展示和下游上下文索引，不复制 artifact 内容。

## Context 设计

每个 todo 可以看成一个隔离子任务，类似轻量 sub-agent。不要把所有工具结果和中间状态都放到一个大上下文里。

当前分层：

- `RunContext`：用户目标、选中 skill 摘要、todo 快照、artifact index、最终摘要。
- `TodoContext`：单个 todo 的局部输入、工具调用摘要、私有中间状态。
- `ContextPack`：进入单个 todo 前重新组织出的上下文包，包含用户目标、当前 todo、todo plan、前序 completion 摘要和 refs。
- `TodoCompletion`：todo 结束后写入的可传递摘要、outputs、artifact refs、sandbox refs、decisions、nextContextSummary。

后续 todo 只能读取前序 `TodoCompletion` 摘要和 refs，不能默认读取前序 todo 的完整私有上下文。

## 执行流程示例

前置流程：

1. 读取用户诉求。
2. 前端传入 `skillName`。
3. 后端按 `skillName` 加载对应 `SKILL.md`。
4. Orchestrator 接收 `loadedSkill`，不再进行模型选 skill。
5. `SkillRunEngine` 启动 planner，要求模型调用 `write_todos` 产出完整 todo plan。每个 todo 必须有 `id`、`title`、`description`、`expectedOutput`、`status`。

任务执行流程：

1. Runtime 将每个 todo 作为隔离子任务执行；如果 planner 没有产出 todo，Runtime 创建一个兜底 todo，而不是进入 direct executor。
2. Runtime 使用 `write_todos` 更新当前 todo 的 `in_progress` / `completed` / `failed` 状态。
3. 进入每个 todo 前，Runtime 构建 `ContextPack`，重新组织用户目标、skill 摘要、当前 todo、整体 todo plan、前序 `TodoCompletion`。
4. 子任务模型调用 sandbox、skill、artifact 等工具完成当前 todo。
5. 子任务完成后，Runtime 调用 LLM 生成结构化 `TodoCompletion`，列出完成内容、artifact refs、sandbox refs、关键决策和 nextContextSummary。
6. Runtime 只把 `TodoCompletion` 注入后续 todo 的上下文，不把完整私有消息历史传给下游 todo。
7. 所有 todo 完成后，模型基于 todos 和 `TodoCompletion` 汇总最终用户回复。

## 文件目录结构

```text
src/agent/
├── artifacts/
│   └── artifact-manager.ts
├── context/
│   └── context-manager.ts
├── core/
│   ├── agent-loop.ts
│   ├── event-bus.ts
│   ├── orchestrator.ts
│   ├── run-controller.ts
│   └── skill-run-engine.ts
├── llm/
│   ├── index.ts
│   ├── model-catalog.ts
│   ├── provider-factory.ts
│   ├── types.ts
│   └── providers/
│       ├── noop-provider.ts
│       ├── openai-compatible-provider.ts
│       └── openrouter-provider.ts
├── skills/
│   └── skill-registry.ts
├── todos/
│   └── todo-manager.ts
├── tools/
│   ├── artifact-tools.ts
│   ├── skill-tools.ts
│   ├── todo-tools.ts
│   ├── tool-registry.ts
│   ├── tool-runner.ts
│   └── sandbox/
│       ├── local-sandbox-adapter.ts
│       ├── sandbox-adapter.ts
│       └── sandbox-tools.ts
├── types.ts
└── index.ts
```
