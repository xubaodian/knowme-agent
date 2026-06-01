# 本地日志设计

## 目标

先保持简单：开发阶段只需要一个本地 `logs/` 目录，日志写入当前文件，定期归档为带时间戳的文件，方便直接打开、grep、复制给别人看。

实现也保持简单：`src/logging/index.ts` 是唯一封装层，只负责初始化 `log4js`、输出 key/value 日志、创建带 run 上下文的轻量 logger，以及提供一个本地调试用的按 `runId` 读日志函数。后续如果替换日志库，只改这个文件。

## 文件

使用 `log4js` 的 `dateFile` appender。

当前正在写入的文件：

```text
logs/app.log
```

归档文件：

```text
logs/app.2026-06-01-10.log
```

每行一条日志：

```text
[2026-06-01T10:00:00.000] [INFO] tool.run.end runId="run_x" toolName="read_file" durationMs=12
```

## 保留时间

默认按小时归档，不追求精确 10 分钟切分。`numBackups = KNOWME_LOG_RETENTION_DAYS * 24`，默认保留约两天。

配置：

```text
KNOWME_LOG_DIR=logs
KNOWME_LOG_LEVEL=info
KNOWME_LOG_CONSOLE=false
KNOWME_LOG_RETENTION_DAYS=2
```

## 记录范围

- HTTP 请求：method、path、status、duration、requestId。
- Run：queued、execute、completed、failed。
- Agent：provider 状态、工具注册、skill 选择、执行模式、todo plan、todo 子任务开始/结束/失败、final reply。
- Agent Loop：phase、iteration、消息数量、可用工具、模型响应是否包含 tool call、每次 tool call 请求和结果。
- LLM：provider、model、phase、消息角色、可用工具名、耗时、finish reason、响应摘要、token 用量、tool call 名称。
- Tool：toolName、输入摘要、输入大小、输出摘要、输出 data 类型、耗时、错误。
- Sandbox：命令、cwd、timeout、退出码、stdout/stderr 摘要、文件路径、文件大小、patch 数量、浏览器 URL、截图信息。
- Artifact：id、kind、title、display mode、preview target、内容大小。

Span 的 `*.start` 和 `*.end` 都会在默认 `info` 级别输出，方便观察长耗时步骤当前卡在哪。

## 安全

日志不记录完整 prompt/messages。敏感字段名会被脱敏，例如：

- `apiKey`
- `token`
- `secret`
- `authorization`
- `cookie`

## 查询

保留本地调试接口：

```text
GET /api/runs/:runId/logs
```

它只是从 `logs/app.log*` 里按 `runId` 过滤并返回最近几百行。
