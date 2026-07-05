import type { Artifact, ArtifactDisplay, ArtifactKind } from "../../shared/types.js";
import type { ArtifactManager } from "../artifacts/artifact-manager.js";
import type { AgentTool, ToolExecutionContext, ToolRunResult } from "../types.js";

type ArtifactSource =
  | { type: "file"; path: string }
  | { type: "inline"; content: string }
  | { type: "url"; url: string };

type PublishArtifactInput = {
  kind: ArtifactKind;
  title: string;
  description?: string;
  source?: ArtifactSource;
  display?: Partial<ArtifactDisplay>;
  metadata?: Record<string, string | number | boolean | null>;
  content?: string;
  value?: unknown;
  language?: string;
  url?: string;
  alt?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  columns?: Array<{ key: string; label: string }>;
  rows?: Array<Record<string, string | number | boolean | null>>;
  chartType?: "bar" | "line" | "metric";
  series?: Array<{ label: string; value: number }>;
  unit?: string;
  slides?: Array<{ title: string; bullets: string[] }>;
};

export function createArtifactTools(): AgentTool[] {
  return [
    {
      name: "publish_artifact",
      description:
        "Register a user-visible deliverable from an existing workspace file, inline content, or URL. Use write_file for raw file creation first. File sources must use relative workspace paths.",
      inputSchema: publishArtifactSchema(),
      summarizeInput: (input) => summarizePublishArtifactInput(input as PublishArtifactInput),
      summarizeOutput: (output) => output.summary ?? "Artifact 已发布。",
      async run(input, context): Promise<ToolRunResult> {
        const artifact = await buildArtifact(context.artifactManager, input as PublishArtifactInput, context);
        const published = context.artifactManager.publish(artifact);

        return {
          summary: `Artifact 已发布：${published.title}。`,
          data: { artifact: published }
        };
      }
    }
  ];
}

async function buildArtifact(
  artifactManager: ArtifactManager,
  input: PublishArtifactInput,
  context: ToolExecutionContext
): Promise<Artifact> {
  const sourceData = await resolveArtifactSource(input, context);
  const base = buildBase(artifactManager, {
    ...input,
    metadata: {
      ...input.metadata,
      ...(sourceData.sourcePath ? { sourcePath: sourceData.sourcePath } : {})
    }
  });
  const content = input.content ?? sourceData.content ?? "";
  const url = input.url ?? sourceData.url;

  switch (input.kind) {
    case "text":
    case "markdown":
      return { ...base, kind: input.kind, content };
    case "code":
      return { ...base, kind: "code", language: input.language ?? "text", content };
    case "html":
      return { ...base, kind: "html", content };
    case "image":
      return { ...base, kind: "image", url: required(url, "url or source.url"), alt: input.alt };
    case "pdf":
      return { ...base, kind: "pdf", url, fileName: input.fileName };
    case "slides":
      return { ...base, kind: "slides", slides: input.slides ?? [] };
    case "table":
      return { ...base, kind: "table", columns: input.columns ?? [], rows: input.rows ?? [] };
    case "chart":
      return { ...base, kind: "chart", chartType: input.chartType ?? "bar", series: input.series ?? [], unit: input.unit };
    case "json":
      return { ...base, kind: "json", value: input.value ?? tryParseJson(content) ?? null };
    case "file":
      return {
        ...base,
        kind: "file",
        fileName: input.fileName ?? sourceData.sourcePath ?? input.title,
        mimeType: input.mimeType ?? "application/octet-stream",
        sizeBytes: input.sizeBytes,
        url
      };
  }
}

async function resolveArtifactSource(
  input: PublishArtifactInput,
  context: ToolExecutionContext
): Promise<{ content?: string; url?: string; sourcePath?: string }> {
  if (!input.source) {
    return {};
  }

  if (input.source.type === "inline") {
    return { content: input.source.content };
  }

  if (input.source.type === "url") {
    return { url: input.source.url };
  }

  const sourcePath = required(input.source.path, "source.path");

  if (["html", "markdown", "text", "code", "json"].includes(input.kind)) {
    const file = await context.sandbox.readFile({ path: sourcePath });
    return { content: file.content, sourcePath };
  }

  return { sourcePath };
}

function buildBase(artifactManager: ArtifactManager, input: PublishArtifactInput) {
  return {
    ...artifactManager.base(
      input.kind,
      input.title,
      {
        mode: input.display?.mode ?? defaultDisplayMode(input.kind),
        label: input.display?.label ?? defaultDisplayLabel(input.kind),
        previewTarget: input.display?.previewTarget ?? defaultPreviewTarget(input.kind),
        priority: input.display?.priority
      },
      input.description
    ),
    metadata: input.metadata
  };
}

function defaultDisplayMode(kind: ArtifactKind): ArtifactDisplay["mode"] {
  if (kind === "image") {
    return "inline";
  }

  if (kind === "file" || kind === "pdf") {
    return "download";
  }

  return kind === "html" || kind === "slides" ? "preview" : "button";
}

function defaultDisplayLabel(kind: ArtifactKind): string {
  return kind === "file" ? "下载文件" : "打开产物";
}

function defaultPreviewTarget(kind: ArtifactKind): ArtifactDisplay["previewTarget"] {
  return kind === "html" || kind === "slides" ? "sandbox" : "modal";
}

function summarizePublishArtifactInput(input: PublishArtifactInput): string {
  const details = [
    `kind=${input.kind}`,
    `title=${input.title}`,
    input.source?.type ? `source=${input.source.type}` : undefined,
    input.display?.mode ? `display=${input.display.mode}` : undefined
  ].filter(Boolean);

  return `发布 artifact（${details.join("，")}）。`;
}

function required<T>(value: T | undefined, fieldName: string): T {
  if (value === undefined || value === null || value === "") {
    throw new Error(`publish_artifact requires ${fieldName}.`);
  }

  return value;
}

function tryParseJson(content: string): unknown | undefined {
  if (!content.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function publishArtifactSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "title"],
    properties: {
      kind: {
        type: "string",
        enum: ["text", "markdown", "code", "html", "image", "pdf", "slides", "table", "chart", "json", "file"]
      },
      title: { type: "string" },
      description: { type: "string" },
      source: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: { type: "string", enum: ["file", "inline", "url"] },
          path: { type: "string" },
          content: { type: "string" },
          url: { type: "string" }
        }
      },
      display: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: { type: "string", enum: ["inline", "button", "preview", "download", "hidden"] },
          label: { type: "string" },
          previewTarget: { type: "string", enum: ["sandbox", "modal", "new_tab", "none"] },
          priority: { type: "number" }
        }
      },
      metadata: { type: "object" },
      content: { type: "string" },
      value: {},
      language: { type: "string" },
      url: { type: "string" },
      alt: { type: "string" },
      fileName: { type: "string" },
      mimeType: { type: "string" },
      sizeBytes: { type: "number" },
      columns: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "label"],
          properties: {
            key: { type: "string" },
            label: { type: "string" }
          }
        }
      },
      rows: { type: "array", items: { type: "object" } },
      chartType: { type: "string", enum: ["bar", "line", "metric"] },
      series: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "value"],
          properties: {
            label: { type: "string" },
            value: { type: "number" }
          }
        }
      },
      unit: { type: "string" },
      slides: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "bullets"],
          properties: {
            title: { type: "string" },
            bullets: { type: "array", items: { type: "string" } }
          }
        }
      }
    }
  };
}
