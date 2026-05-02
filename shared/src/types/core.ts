export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface AttachmentRef {
  id: string;
  name: string;
  mimeType: string;
  path: string;
  sizeBytes?: number;
}

export interface AgentRequest {
  requestId: string;
  userId: string;
  sessionId: string;
  message: string;
  attachments: AttachmentRef[];
  metadata?: Record<string, JsonValue>;
}

export interface TaskPlanStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  dependsOn: string[];
  selectedSkillIds: string[];
  requiredCapabilities: string[];
  expectedOutputs: string[];
}

export interface TaskPlan {
  goal: string;
  steps: TaskPlanStep[];
  dependencies: Array<{ from: string; to: string }>;
  selectedSkills: string[];
  requiredCapabilities: string[];
  expectedOutputs: string[];
  risks: string[];
}

export interface SkillStep {
  id: string;
  type:
    | "llm.generate"
    | "llm.check"
    | "llm.rewrite"
    | "sandbox.fs.read"
    | "sandbox.fs.write"
    | "sandbox.exec.run"
    | "sandbox.browser.open"
    | "sandbox.browser.extract"
    | "sandbox.artifact.write";
  title: string;
  input: Record<string, JsonValue>;
  outputKey?: string;
}

export interface SkillSpec {
  id: string;
  name: string;
  description: string;
  version: string;
  source: string;
  format: "structured" | "claude-markdown";
  inputs: string[];
  outputs: string[];
  steps: SkillStep[];
  requires: string[];
  permissions: string[];
  tags: string[];
  entryPath?: string;
  skillDir?: string;
  content?: string;
  scriptPaths?: string[];
  referencePaths?: string[];
}

export interface SkillExecution {
  skillId: string;
  status: "pending" | "running" | "completed" | "failed";
  inputs: Record<string, JsonValue>;
  outputs: Record<string, JsonValue>;
  stepResults: Array<{
    stepId: string;
    status: "pending" | "running" | "completed" | "failed";
    output?: JsonValue;
    error?: string;
  }>;
}

export interface SandboxCall {
  callId: string;
  taskId: string;
  skillId: string;
  stepId: string;
  provider: "fs" | "exec" | "browser" | "artifact" | "codeInterpreter";
  capability: string;
  action: string;
  input: Record<string, JsonValue>;
  output?: JsonValue;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  endedAt?: string;
}

export interface MemoryRecord {
  id: string;
  scope: "profile" | "session";
  type: "identity" | "preference" | "instruction" | "task-history";
  userId: string;
  sessionId?: string;
  content: string;
  metadata?: Record<string, JsonValue>;
  createdAt: string;
  updatedAt: string;
}

export interface Artifact {
  id: string;
  type: "text" | "json" | "image" | "file";
  name: string;
  path: string;
  producer: string;
  metadata?: Record<string, JsonValue>;
}

export interface SkillRegistryEntry {
  skillId: string;
  name: string;
  description: string;
  enabled: boolean;
  source: string;
  manifestPath: string;
}

export interface AgentResponse {
  requestId: string;
  sessionId: string;
  summary: string;
  plan?: TaskPlan;
  selectedSkillIds: string[];
  skillExecutions: SkillExecution[];
  sandboxCalls: SandboxCall[];
  artifacts: Artifact[];
  memoryWrites: MemoryRecord[];
}

export interface DashboardTraceItem {
  provider: string;
  capability: string;
  status: string;
  detail: string;
}

export interface DashboardPlanItem {
  id: string;
  title: string;
  description: string;
  state: string;
}

export interface DashboardArtifactItem {
  name: string;
  type: string;
  location: string;
}

export interface DashboardMemoryItem {
  scope: string;
  content: string;
}

export interface DashboardSkillItem {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
}

export interface DashboardSnapshot {
  agentName: string;
  persona: string;
  profile: {
    tone: string;
    defaultLanguage: string;
    planningMode: string;
  };
  currentTask: {
    title: string;
    input: string;
    attachments: string[];
    status: string;
    selectedSkills: string[];
  };
  plan: DashboardPlanItem[];
  traces: DashboardTraceItem[];
  artifacts: DashboardArtifactItem[];
  memory: DashboardMemoryItem[];
  skills: DashboardSkillItem[];
  latestResponse?: AgentResponse;
}

export interface RunTaskPayload {
  message: string;
}
