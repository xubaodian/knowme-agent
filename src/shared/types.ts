export type ChatRole = "user" | "assistant" | "system";

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  runId?: string;
};

export type RunStatus = "queued" | "running" | "completed" | "failed";

export type Run = {
  id: string;
  chatId: string;
  userMessageId: string;
  status: RunStatus;
  model?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type LlmModelOption = {
  provider: string;
  id: string;
  label: string;
  description?: string;
};

export type ListLlmModelsResponse = {
  provider: string;
  configured: boolean;
  currentModel: string;
  defaultModel: string;
  models: LlmModelOption[];
};

export type RunEventType =
  | "run.started"
  | "thought.created"
  | "summary.created"
  | "todo.created"
  | "todo.updated"
  | "tool.started"
  | "tool.finished"
  | "sandbox.updated"
  | "approval.requested"
  | "artifact.created"
  | "artifact.updated"
  | "message.created"
  | "run.completed"
  | "run.failed";

export type AgentFlowKind =
  | "status"
  | "thought"
  | "summary"
  | "todo"
  | "tool"
  | "sandbox"
  | "approval"
  | "artifact"
  | "assistant_message"
  | "error";

export type AgentFlowVisibility = "primary" | "secondary" | "debug" | "internal";

export type AgentFlowAction = {
  id: string;
  label: string;
  kind: "open_artifact" | "takeover" | "approve" | "reject" | "download" | "open_sandbox";
  targetId?: string;
};

export type ArtifactKind =
  | "text"
  | "markdown"
  | "code"
  | "html"
  | "image"
  | "pdf"
  | "slides"
  | "table"
  | "chart"
  | "json"
  | "file";

export type ArtifactStatus = "draft" | "streaming" | "ready" | "failed";

export type ArtifactDisplayMode = "inline" | "button" | "preview" | "download" | "hidden";

export type ArtifactDisplay = {
  mode: ArtifactDisplayMode;
  label?: string;
  previewTarget?: "sandbox" | "modal" | "new_tab" | "none";
  priority?: number;
};

export type BaseArtifact = {
  id: string;
  runId: string;
  chatId: string;
  kind: ArtifactKind;
  title: string;
  status: ArtifactStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
  description?: string;
  display: ArtifactDisplay;
  metadata?: Record<string, string | number | boolean | null>;
};

export type TextArtifact = BaseArtifact & {
  kind: "text" | "markdown";
  content: string;
};

export type CodeArtifact = BaseArtifact & {
  kind: "code";
  language: string;
  content: string;
};

export type HtmlArtifact = BaseArtifact & {
  kind: "html";
  content: string;
};

export type ImageArtifact = BaseArtifact & {
  kind: "image";
  url: string;
  alt?: string;
};

export type PdfArtifact = BaseArtifact & {
  kind: "pdf";
  url?: string;
  fileName?: string;
};

export type SlidesArtifact = BaseArtifact & {
  kind: "slides";
  slides: Array<{
    title: string;
    bullets: string[];
  }>;
};

export type TableArtifact = BaseArtifact & {
  kind: "table";
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | number | boolean | null>>;
};

export type ChartArtifact = BaseArtifact & {
  kind: "chart";
  chartType: "bar" | "line" | "metric";
  series: Array<{ label: string; value: number }>;
  unit?: string;
};

export type JsonArtifact = BaseArtifact & {
  kind: "json";
  value: unknown;
};

export type FileArtifact = BaseArtifact & {
  kind: "file";
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  url?: string;
};

export type Artifact =
  | TextArtifact
  | CodeArtifact
  | HtmlArtifact
  | ImageArtifact
  | PdfArtifact
  | SlidesArtifact
  | TableArtifact
  | ChartArtifact
  | JsonArtifact
  | FileArtifact;

export type RunEvent = {
  id: string;
  runId: string;
  chatId: string;
  type: RunEventType;
  title: string;
  detail?: string;
  status?: RunStatus | "pending" | "in_progress" | "done";
  flowKind?: AgentFlowKind;
  visibility?: AgentFlowVisibility;
  createdAt: string;
  sequence: number;
  artifactId?: string;
  actions?: AgentFlowAction[];
  payload?: {
    artifact?: Artifact;
  };
};

export type CreateChatResponse = {
  chat: ChatSession;
};

export type SendMessageResponse = {
  message: ChatMessage;
  run: Run;
};

export type RunTraceNodeType = "run" | "phase" | "llm" | "tool" | "todo" | "artifact" | "event" | "error";

export type RunTraceNodeStatus = "pending" | "running" | "success" | "error" | "skipped";

export type RunTraceSummary = {
  runId: string;
  folderName: string;
  status: RunTraceNodeStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  chatId?: string;
  userMessageId?: string;
  model?: string;
  promptSummary?: string;
  nodeCount?: number;
  durationMs?: number;
};

export type RunTraceNode = {
  id: string;
  runId: string;
  parentId?: string;
  type: RunTraceNodeType;
  status: RunTraceNodeStatus;
  title: string;
  summary?: string;
  sequence: number;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  inputRef?: string;
  outputRef?: string;
  errorRef?: string;
  metadata?: Record<string, unknown>;
};

export type RunTraceDetail = {
  run: RunTraceSummary;
  nodes: RunTraceNode[];
};
