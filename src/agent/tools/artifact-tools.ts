import type { Artifact, ArtifactDisplay, ArtifactKind } from "../../shared/types.js";
import type { ArtifactManager } from "../artifacts/artifact-manager.js";
import type { AgentTool, ToolRunResult } from "../types.js";

type CreateArtifactInput = {
  kind: ArtifactKind;
  title: string;
  description?: string;
  display?: Partial<ArtifactDisplay>;
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
      name: "create_artifact",
      description: "Publish a user-visible artifact from inline content or a sandbox/external URL.",
      inputSchema: {
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
          content: { type: "string", description: "Text, markdown, code, or html content." },
          value: { description: "JSON artifact value." },
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
      },
      summarizeInput: (input) => summarizeCreateArtifactInput(input as CreateArtifactInput),
      summarizeOutput: (output) => output.summary ?? "Artifact 已创建。",
      async run(input, context): Promise<ToolRunResult> {
        const artifact = buildArtifact(context.artifactManager, input as CreateArtifactInput);
        const published = context.artifactManager.publish(artifact);

        return {
          summary: `Artifact 已发布：${published.title}。`,
          data: { artifact: published }
        };
      }
    }
  ];
}

function buildArtifact(artifactManager: ArtifactManager, input: CreateArtifactInput): Artifact {
  const base = buildBase(artifactManager, input);

  switch (input.kind) {
    case "text":
    case "markdown":
      return { ...base, kind: input.kind, content: input.content ?? "" };
    case "code":
      return { ...base, kind: "code", language: input.language ?? "text", content: input.content ?? "" };
    case "html":
      return { ...base, kind: "html", content: input.content ?? "" };
    case "image":
      return { ...base, kind: "image", url: required(input.url, "url"), alt: input.alt };
    case "pdf":
      return { ...base, kind: "pdf", url: input.url, fileName: input.fileName };
    case "slides":
      return { ...base, kind: "slides", slides: input.slides ?? [] };
    case "table":
      return { ...base, kind: "table", columns: input.columns ?? [], rows: input.rows ?? [] };
    case "chart":
      return { ...base, kind: "chart", chartType: input.chartType ?? "bar", series: input.series ?? [], unit: input.unit };
    case "json":
      return { ...base, kind: "json", value: input.value ?? null };
    case "file":
      return {
        ...base,
        kind: "file",
        fileName: input.fileName ?? input.title,
        mimeType: input.mimeType ?? "application/octet-stream",
        sizeBytes: input.sizeBytes,
        url: input.url
      };
  }
}

function buildBase(artifactManager: ArtifactManager, input: CreateArtifactInput) {
  return artifactManager.base(
    input.kind,
    input.title,
    {
      mode: input.display?.mode ?? defaultDisplayMode(input.kind),
      label: input.display?.label ?? defaultDisplayLabel(input.kind),
      previewTarget: input.display?.previewTarget ?? defaultPreviewTarget(input.kind),
      priority: input.display?.priority
    },
    input.description
  );
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

function summarizeCreateArtifactInput(input: CreateArtifactInput): string {
  const contentChars = typeof input.content === "string" ? input.content.length : undefined;
  const itemCount =
    input.rows?.length ??
    input.series?.length ??
    input.slides?.length ??
    (Array.isArray(input.value) ? input.value.length : undefined);
  const details = [
    `类型：${input.kind}`,
    `标题：${input.title}`,
    input.display?.mode ? `展示：${input.display.mode}` : undefined,
    contentChars !== undefined ? `内容 ${contentChars} 字符` : undefined,
    itemCount !== undefined ? `条目 ${itemCount}` : undefined
  ].filter(Boolean);

  return `准备创建 artifact（${details.join("，")}）。`;
}

function required(value: string | undefined, fieldName: string): string {
  if (!value) {
    throw new Error(`create_artifact requires ${fieldName}.`);
  }

  return value;
}
