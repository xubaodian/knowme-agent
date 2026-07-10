# knowme-agent

一个本地可运行的 Agent 工作台：将用户任务组织为可观察、可追溯的执行 Run，而不只是一次模型对话。用户可以选择模型和 Skill，查看任务规划、Todo 与工具执行，在工作区预览文件和浏览器结果，并获得可复用的 Artifact。

> **项目说明**：本项目的产品功能设计由我主导，编码和架构设计原则有我制定，部分架构设计与技术决策其制定；具体代码实现由 Codex 完成。这是一次以清晰产品意图和工程边界驱动的 AI 协作开发实践。

![knowme-agent architecture](docs/assets/knowme-agent-architecture.svg)

## What it does

- **Task-based execution** — 每条用户任务都会创建独立的 Run，覆盖规划、执行与收尾三个阶段。
- **Visible progress** — 通过 SSE 将计划、Todo、工具状态、阶段总结、Artifact 和完成状态实时推送到界面。
- **Skill and model selection** — 任务启动前选择模型与 Skill；Skill 会被快照到该 Run 的工作区，便于重放与排查。
- **Artifact delivery** — 支持文本、Markdown、代码、HTML、图片、PDF、Slides、表格、图表、JSON 和文件等交付物。
- **Local sandbox** — 每个 Run 使用隔离的本地工作区，提供受控的文件、命令、代码和浏览器操作能力。
- **Debuggable runtime** — 运行状态、事件、日志与节点级 Trace 可通过调试 API 追溯。

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local
```

编辑 `.env.local` 并填入 OpenRouter API key：

```dotenv
KNOWME_LLM_PROVIDER=openrouter
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=your_api_key
```

启动本地开发环境：

```bash
npm run dev
```

- 工作台：<http://127.0.0.1:5173>
- API：<http://127.0.0.1:3000>
- 健康检查：<http://127.0.0.1:3000/api/health>

`npm run dev` 会同时启动 Hono API 和 Vite 前端。没有有效的模型配置时，任务会明确失败，不会返回模拟完成结果。

## How to use it

1. 在工作台新建会话并输入任务。
2. 选择模型和 Skill。内置 `general-task` 用于通用任务，`html-report` 用于生成并验证自包含 HTML 报告。
3. 提交后，在 Agent Flow 中查看计划、Todo、工具执行和阶段性结果。
4. 在右侧工作区查看浏览器、代码、文件、命令执行和 Artifact 预览。
5. 任务结束后，可在会话时间线中回看 Run、事件和交付物。

## Architecture

```text
React + Vite workspace
        │ REST + SSE
        ▼
Hono application service
        │ creates and persists Runs
        ▼
Agent runtime
  Planning → Todo execution → Finalization
        │
        ├── LLM Provider (OpenRouter, OpenAI-compatible)
        ├── Skill snapshot
        ├── Tool registry
        ├── Local sandbox
        └── Artifact manager
```

一个 Run 的关键对象是：

| Object     | Purpose                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `Chat`     | 保存会话与用户/助手消息。                                                 |
| `Run`      | 一次独立的任务执行，状态为 `queued`、`running`、`completed` 或 `failed`。 |
| `Todo`     | Run 内按顺序推进的执行单元；后续步骤默认只接收前序摘要和引用。            |
| `RunEvent` | 面向 UI 和调试的稳定事件契约，包括计划、工具、沙箱和完成状态。            |
| `Artifact` | 可预览、下载或供后续步骤使用的任务交付物。                                |

更多说明见：[产品介绍](docs/knowme-agent-product-introduction.md) 和 [架构说明](docs/knowme-agent-architecture.md)。

## Project layout

```text
agent/
  skills/                    # 内置 Skill 定义
  prompts/                   # Skill 与运行时提示词
src/
  agent/                     # 编排、上下文、模型、工具、Sandbox、Artifact
  server/                    # Hono routes、Run/Chat services、本地状态
  web/                       # React 工作台
  logging/                   # 结构化日志与 Run Trace
  shared/                    # 前后端共享类型和视图模型
docs/                        # 产品与架构文档、流程图
test/                        # Node test runner 测试
```

## API overview

| Endpoint                           | Purpose                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `GET /api/health`                  | 服务健康检查。                                                            |
| `GET, POST /api/chats`             | 查询或创建会话。                                                          |
| `POST /api/chats/:chatId/messages` | 添加用户消息并创建 Run。请求包含 `content`，可选 `model` 和 `skillName`。 |
| `GET /api/chats/:chatId/timeline`  | 获取会话、消息、Runs、事件和 Artifact 的完整时间线。                      |
| `GET /api/runs/:runId/events`      | 以 SSE 回放并持续推送 Run 事件。                                          |
| `GET /api/runs/:runId/artifacts`   | 获取 Run 交付物。                                                         |
| `GET /api/runs/:runId/logs`        | 获取 Run 日志。                                                           |
| `GET /api/llm/models`              | 获取当前模型配置状态和可选模型。                                          |
| `GET /api/skills`                  | 获取可选 Skill。                                                          |
| `GET /api/debug/runs`              | 获取可用于调试的 Run Trace 列表。                                         |

## Commands

| Command             | Description                            |
| ------------------- | -------------------------------------- |
| `npm run dev`       | 并行启动 API 和前端开发服务器。        |
| `npm run build`     | 构建服务端与前端到 `dist/`。           |
| `npm run typecheck` | 执行 TypeScript 类型检查。             |
| `npm test`          | 类型检查、构建服务端并运行 Node 测试。 |
| `npm start`         | 启动已构建的 Hono 服务。               |

## Local data and configuration

默认情况下，本地开发数据不会进入 Git：

```text
.knowme/
├── app-state.json            # 会话、消息、Run、事件与 Artifact 元数据
└── workspaces/<run-id>/
    ├── files/                # Run 可读写文件
    ├── skill/                # 当前 Run 的 Skill 快照
    ├── artifacts/            # 任务产物
    ├── browser/              # 浏览器资源
    └── meta.json             # Run 元信息
```

可用环境变量：

| Variable               | Default                                               | Description                              |
| ---------------------- | ----------------------------------------------------- | ---------------------------------------- |
| `KNOWME_LLM_PROVIDER`  | `openrouter` when an API key is set; otherwise `none` | 模型 Provider 标识。                     |
| `OPENROUTER_BASE_URL`  | `https://openrouter.ai/api/v1`                        | OpenRouter 兼容 API 地址。               |
| `OPENROUTER_API_KEY`   | —                                                     | OpenRouter API key，执行真实任务时必填。 |
| `OPENROUTER_MODEL`     | `moonshotai/kimi-k2.7-code`                           | 默认 OpenRouter 模型。                   |
| `OPENROUTER_APP_URL`   | —                                                     | 可选的 OpenRouter 应用 URL。             |
| `OPENROUTER_APP_TITLE` | —                                                     | 可选的 OpenRouter 应用名称。             |
| `PORT`                 | `3000`                                                | Hono API 监听端口。                      |
| `HOST`                 | `127.0.0.1`                                           | Hono API 监听地址。                      |
| `KNOWME_STATE_FILE`    | `.knowme/app-state.json`                              | 本地应用状态文件路径。                   |

## Development notes

- 前端只消费稳定的 `RunEvent` 和 `Artifact` 契约；新增运行时能力时，优先保持这两个边界稳定。
- Skill 是以 `SKILL.md` 为入口的目录，可携带 `references/`、`scripts/` 和 `assets/`。服务端会在启动 Run 时校验并快照所选 Skill。
- `LocalSandboxAdapter` 将文件操作限制在当前 Run 的工作区。生产部署需要再接入数据库、对象存储、队列、云端 Sandbox 与权限体系。
