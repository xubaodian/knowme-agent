import { EventEmitter } from "node:events";
import type { Artifact, Run, RunEvent, RunEventType } from "../../shared/types.js";

type CreateRunOptions = {
  chatId: string;
  userMessageId: string;
  prompt: string;
  onComplete?: (reply: string, runId: string) => void;
};

const runs = new Map<string, Run>();
const eventsByRun = new Map<string, RunEvent[]>();
const artifactsByRun = new Map<string, Artifact[]>();
const emitter = new EventEmitter();

const now = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export function createRun(options: CreateRunOptions): Run {
  const timestamp = now();
  const run: Run = {
    id: createId("run"),
    chatId: options.chatId,
    userMessageId: options.userMessageId,
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  runs.set(run.id, run);
  eventsByRun.set(run.id, []);
  artifactsByRun.set(run.id, []);
  scheduleMockExecution(run.id, options);

  return run;
}

export function getRun(runId: string): Run | undefined {
  return runs.get(runId);
}

export function getRunEvents(runId: string): RunEvent[] {
  return [...(eventsByRun.get(runId) ?? [])];
}

export function getRunArtifacts(runId: string): Artifact[] {
  return [...(artifactsByRun.get(runId) ?? [])];
}

export function subscribeRunEvents(runId: string, listener: (event: RunEvent) => void | Promise<void>): () => void {
  const eventName = eventChannel(runId);
  emitter.on(eventName, listener);
  return () => emitter.off(eventName, listener);
}

function scheduleMockExecution(runId: string, options: CreateRunOptions) {
  const steps: Array<[number, () => void]> = [
    [
      100,
      () => {
        updateRun(runId, "running");
        pushEvent(runId, options.chatId, "run.started", "Run started", "应用层已接收消息，准备执行 mock agent run。", "running", {
          flowKind: "status",
          visibility: "secondary"
        });
      }
    ],
    [
      300,
      () => {
        pushEvent(runId, options.chatId, "thought.created", "任务理解", "我会先确认目标，再拆解 todo，最后把需要操作或预览的产物暴露给用户。", "done", {
          flowKind: "thought",
          visibility: "secondary"
        });
      }
    ],
    [
      500,
      () =>
        pushEvent(runId, options.chatId, "todo.created", "理解用户输入", compactPrompt(options.prompt), "pending", {
          flowKind: "todo",
          visibility: "primary"
        })
    ],
    [
      900,
      () =>
        pushEvent(runId, options.chatId, "todo.updated", "理解用户输入", "已提取目标、上下文和需要展示的执行进度。", "done", {
          flowKind: "todo",
          visibility: "primary"
        })
    ],
    [
      1300,
      () =>
        pushEvent(runId, options.chatId, "tool.started", "调用 mock executor", "Agent runtime 尚未接入，当前使用应用层模拟器。", "in_progress", {
          flowKind: "tool",
          visibility: "primary"
        })
    ],
    [
      1900,
      () =>
        pushEvent(runId, options.chatId, "tool.finished", "mock executor completed", "生成结构化进度事件和最终回复。", "done", {
          flowKind: "tool",
          visibility: "primary"
        })
    ],
    [
      2000,
      () =>
        pushEvent(runId, options.chatId, "sandbox.updated", "沙箱就绪", "右侧可用于浏览器登录、文件编辑、HTML 预览或用户接管。", "done", {
          flowKind: "sandbox",
          visibility: "secondary",
          actions: [
            {
              id: createId("act"),
              kind: "takeover",
              label: "接管沙箱"
            }
          ]
        })
    ],
    [
      2100,
      () => pushArtifact(createMarkdownArtifact(runId, options.chatId, options.prompt))
    ],
    [
      2250,
      () => pushArtifact(createTableArtifact(runId, options.chatId))
    ],
    [
      2400,
      () => pushArtifact(createChartArtifact(runId, options.chatId))
    ],
    [
      2550,
      () => pushArtifact(createCodeArtifact(runId, options.chatId))
    ],
    [
      2700,
      () => pushArtifact(createHtmlArtifact(runId, options.chatId))
    ],
    [
      2850,
      () => pushArtifact(createJsonArtifact(runId, options.chatId))
    ],
    [
      3000,
      () => pushArtifact(createSlidesArtifact(runId, options.chatId))
    ],
    [
      3150,
      () => pushArtifact(createImageArtifact(runId, options.chatId))
    ],
    [
      3300,
      () => pushArtifact(createFileArtifact(runId, options.chatId))
    ],
    [
      3450,
      () =>
        pushEvent(runId, options.chatId, "summary.created", "阶段小结", "已生成多种 artifact，其中图片内联展示，其余按 display 协议决定是否提供右侧预览入口。", "done", {
          flowKind: "summary",
          visibility: "primary"
        })
    ],
    [
      3650,
      () =>
        pushEvent(runId, options.chatId, "message.created", "生成助手回复", "回复已写入当前会话。", "done", {
          flowKind: "assistant_message",
          visibility: "secondary"
        })
    ],
    [
      4000,
      () => {
        const reply = `收到：${options.prompt}\n\n这是应用层 mock run 的回复。后续接入 Agent runtime 后，这里会替换为真实 Skill/Todo/Tool 执行结果。`;
        options.onComplete?.(reply, runId);
        updateRun(runId, "completed");
        pushEvent(runId, options.chatId, "run.completed", "Run completed", "本次 mock run 已完成。", "completed", {
          flowKind: "status",
          visibility: "secondary"
        });
      }
    ]
  ];

  for (const [delay, step] of steps) {
    setTimeout(step, delay);
  }
}

function pushEvent(
  runId: string,
  chatId: string,
  type: RunEventType,
  title: string,
  detail?: string,
  status?: RunEvent["status"],
  extras?: Pick<RunEvent, "actions" | "artifactId" | "flowKind" | "payload" | "visibility">
) {
  const events = eventsByRun.get(runId);

  if (!events) {
    return;
  }

  const event: RunEvent = {
    id: createId("evt"),
    runId,
    chatId,
    type,
    title,
    detail,
    status,
    createdAt: now(),
    sequence: events.length + 1,
    ...extras
  };

  events.push(event);
  emitter.emit(eventChannel(runId), event);
}

function pushArtifact(artifact: Artifact) {
  const artifacts = artifactsByRun.get(artifact.runId);

  if (!artifacts) {
    return;
  }

  artifacts.push(artifact);
  pushEvent(
    artifact.runId,
    artifact.chatId,
    "artifact.created",
    `Artifact: ${artifact.title}`,
    artifact.description,
    "done",
    {
      artifactId: artifact.id,
      flowKind: "artifact",
      visibility: artifact.display.mode === "hidden" ? "internal" : "primary",
      actions:
        artifact.display.mode === "button" || artifact.display.mode === "preview"
          ? [
              {
                id: createId("act"),
                kind: "open_artifact",
                label: artifact.display.label ?? "打开预览",
                targetId: artifact.id
              }
            ]
          : undefined,
      payload: { artifact }
    }
  );
}

function updateRun(runId: string, status: Run["status"]) {
  const run = runs.get(runId);

  if (!run) {
    return;
  }

  run.status = status;
  run.updatedAt = now();

  if (status === "completed" || status === "failed") {
    run.completedAt = run.updatedAt;
  }
}

function eventChannel(runId: string) {
  return `run:${runId}`;
}

function compactPrompt(prompt: string) {
  return prompt.length > 120 ? `${prompt.slice(0, 120)}...` : prompt;
}

function createArtifactBase(runId: string, chatId: string, kind: Artifact["kind"], title: string, description?: string) {
  const timestamp = now();

  return {
    id: createId("art"),
    runId,
    chatId,
    kind,
    title,
    description,
    status: "ready" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    display: {
      mode: "button" as const,
      previewTarget: "sandbox" as const
    }
  };
}

function createMarkdownArtifact(runId: string, chatId: string, prompt: string): Artifact {
  return {
    ...createArtifactBase(runId, chatId, "markdown", "任务摘要", "Markdown 文档产物"),
    kind: "markdown",
    display: {
      mode: "button",
      label: "打开右侧预览",
      previewTarget: "sandbox",
      priority: 10
    },
    content: `# 任务摘要\n\n用户输入：**${prompt}**\n\n## 当前状态\n\n- 应用层已接收消息\n- mock run 已生成结构化事件\n- Artifact 面板可以按类型渲染产物\n\n> 后续接入 Agent runtime 后，这里会变成真实任务说明和结果。`
  };
}

function createTableArtifact(runId: string, chatId: string): Artifact {
  return {
    ...createArtifactBase(runId, chatId, "table", "执行阶段数据", "表格产物"),
    kind: "table",
    display: {
      mode: "button",
      label: "打开表格",
      previewTarget: "sandbox",
      priority: 30
    },
    columns: [
      { key: "stage", label: "Stage" },
      { key: "status", label: "Status" },
      { key: "duration", label: "Duration" }
    ],
    rows: [
      { stage: "parse input", status: "done", duration: "0.4s" },
      { stage: "mock executor", status: "done", duration: "0.6s" },
      { stage: "artifact render", status: "done", duration: "0.8s" }
    ]
  };
}

function createChartArtifact(runId: string, chatId: string): Artifact {
  return {
    ...createArtifactBase(runId, chatId, "chart", "阶段耗时图", "图表产物"),
    kind: "chart",
    display: {
      mode: "button",
      label: "打开图表",
      previewTarget: "sandbox",
      priority: 40
    },
    chartType: "bar",
    unit: "ms",
    series: [
      { label: "input", value: 420 },
      { label: "tool", value: 620 },
      { label: "artifact", value: 820 }
    ]
  };
}

function createCodeArtifact(runId: string, chatId: string): Artifact {
  return {
    ...createArtifactBase(runId, chatId, "code", "Hono 路由示例", "代码产物"),
    kind: "code",
    display: {
      mode: "button",
      label: "打开代码",
      previewTarget: "sandbox",
      priority: 20
    },
    language: "ts",
    content: `import { Hono } from "hono";\n\nconst app = new Hono();\n\napp.get("/api/health", (c) => c.json({ ok: true }));\n\nexport default app;`
  };
}

function createHtmlArtifact(runId: string, chatId: string): Artifact {
  return {
    ...createArtifactBase(runId, chatId, "html", "HTML 预览", "沙箱 iframe 产物"),
    kind: "html",
    display: {
      mode: "preview",
      label: "打开 HTML",
      previewTarget: "sandbox",
      priority: 15
    },
    content: `<!doctype html><html><body style="font-family: system-ui; margin: 0; padding: 24px; background: #f8fafc; color: #172033;"><h1 style="font-size: 24px;">Artifact Preview</h1><p>这是一段由 mock run 生成的 HTML 产物。</p><button style="border: 0; border-radius: 8px; padding: 10px 14px; color: white; background: #1f6f68;">Preview action</button></body></html>`
  };
}

function createJsonArtifact(runId: string, chatId: string): Artifact {
  return {
    ...createArtifactBase(runId, chatId, "json", "结构化结果", "JSON 产物"),
    kind: "json",
    display: {
      mode: "button",
      label: "打开 JSON",
      previewTarget: "sandbox",
      priority: 50
    },
    value: {
      runtime: "mock",
      todos: ["parse input", "run executor", "render artifacts"],
      next: "connect real agent runtime"
    }
  };
}

function createImageArtifact(runId: string, chatId: string): Artifact {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#f2f5f7"/><rect x="80" y="80" width="800" height="380" rx="24" fill="#ffffff" stroke="#cfd8e3"/><circle cx="180" cy="190" r="56" fill="#1f6f68"/><rect x="270" y="150" width="430" height="28" rx="14" fill="#2347a3"/><rect x="270" y="210" width="560" height="22" rx="11" fill="#9aa6b2"/><rect x="270" y="256" width="480" height="22" rx="11" fill="#c2cad4"/><rect x="140" y="340" width="680" height="64" rx="14" fill="#e9f4f2"/></svg>`;

  return {
    ...createArtifactBase(runId, chatId, "image", "图片产物", "图片预览产物"),
    kind: "image",
    display: {
      mode: "inline",
      label: "内联图片",
      previewTarget: "none",
      priority: 60
    },
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    alt: "Mock artifact preview"
  };
}

function createSlidesArtifact(runId: string, chatId: string): Artifact {
  return {
    ...createArtifactBase(runId, chatId, "slides", "方案 slides", "幻灯片预览产物"),
    kind: "slides",
    display: {
      mode: "preview",
      label: "打开 slides",
      previewTarget: "sandbox",
      priority: 25
    },
    slides: [
      {
        title: "应用层目标",
        bullets: ["中间展示 Agent 执行流", "右侧承载沙箱和可接管操作", "Artifact 作为流程中的轻量入口"]
      },
      {
        title: "后续接入",
        bullets: ["真实 Agent runtime", "浏览器接管", "文件上传和产物持久化"]
      }
    ]
  };
}

function createFileArtifact(runId: string, chatId: string): Artifact {
  return {
    ...createArtifactBase(runId, chatId, "file", "导出文件", "通用文件产物"),
    kind: "file",
    display: {
      mode: "download",
      label: "下载文件",
      previewTarget: "none",
      priority: 70
    },
    fileName: "mock-result.zip",
    mimeType: "application/zip",
    sizeBytes: 143872
  };
}
