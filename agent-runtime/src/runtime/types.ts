import type {
  AgentRequest,
  AgentResponse,
  Artifact,
  JsonValue,
  MemoryRecord,
  SandboxCall,
  SkillExecution,
  SkillRegistryEntry,
  SkillSpec,
  TaskPlan,
} from "../shared.ts";

export interface NormalizedRequest extends AgentRequest {
  normalizedMessage: string;
  requestedCapabilities: string[];
}

export interface RuntimeContext {
  request: NormalizedRequest;
  profileMemory: MemoryRecord[];
  sessionMemory: MemoryRecord[];
  selectedMemory: MemoryRecord[];
  availableSkillEntries: SkillRegistryEntry[];
}

export interface SkillSelection {
  primarySkillId?: string;
  selectedSkillIds: string[];
  reason: string;
}

export interface SkillRuntimeResult {
  execution: SkillExecution;
  sandboxCalls: SandboxCall[];
  artifacts: Artifact[];
}

export type SkillToolActionName =
  | "read_file"
  | "write_file"
  | "run_code"
  | "run_command"
  | "browser_open"
  | "browser_snapshot"
  | "browser_act"
  | "browser_extract"
  | "browser_screenshot";

export type SkillControlActionName =
  | "finish"
  | "fail"
  | "request_input"
  | "delegate";

export type SkillToolAction =
  | {
      kind: "tool";
      tool: "read_file";
      reason: string;
      input: { path: string };
    }
  | {
      kind: "tool";
      tool: "write_file";
      reason: string;
      input: { path: string; content: string };
    }
  | {
      kind: "tool";
      tool: "run_code";
      reason: string;
      input: { language: string; source: string };
    }
  | {
      kind: "tool";
      tool: "run_command";
      reason: string;
      input: { command: string; args?: JsonValue[] };
    }
  | {
      kind: "tool";
      tool: "browser_open";
      reason: string;
      input: { url: string };
    }
  | {
      kind: "tool";
      tool: "browser_snapshot";
      reason: string;
      input: { tabId?: string };
    }
  | {
      kind: "tool";
      tool: "browser_act";
      reason: string;
      input: { ref: string; action: string; text?: string; option?: string };
    }
  | {
      kind: "tool";
      tool: "browser_extract";
      reason: string;
      input: { goal?: string; ref?: string };
    }
  | {
      kind: "tool";
      tool: "browser_screenshot";
      reason: string;
      input: { ref?: string; fullPage?: boolean };
    };

export type SkillControlAction =
  | {
      kind: "control";
      action: "finish";
      reason: string;
      input: { summary: string; result?: JsonValue };
    }
  | {
      kind: "control";
      action: "fail";
      reason: string;
      input: { message: string };
    }
  | {
      kind: "control";
      action: "request_input";
      reason: string;
      input: { message: string };
    }
  | {
      kind: "control";
      action: "delegate";
      reason: string;
      input: { goal: string; handoff_state?: JsonValue };
    };

export type SkillLoopAction = SkillToolAction | SkillControlAction;

export interface SkillSessionState {
  iteration: number;
  maxIterations: number;
  requestSummary: string;
  availableAttachments: Array<{
    id: string;
    name: string;
    path: string;
  }>;
  availableReferences: string[];
  availableScripts: string[];
  allowedTools: SkillToolActionName[];
  observations: Array<{
    stepId: string;
    title: string;
    content: string;
  }>;
  readFiles: string[];
  writtenFiles: string[];
  generatedArtifacts: string[];
  completed: boolean;
}

export interface RequestHandlingResult {
  context: RuntimeContext;
  plan?: TaskPlan;
  selection: SkillSelection;
  skillResults: SkillRuntimeResult[];
  memoryWrites: MemoryRecord[];
  response: AgentResponse;
}

export interface LlmStepResult {
  output: JsonValue;
  notes?: string;
}

export interface LlmExecutor {
  run(
    stepType: string,
    input: Record<string, JsonValue>,
    context: RuntimeContext,
  ): Promise<LlmStepResult>;
}

export interface MemoryStore {
  listProfileMemory(userId: string): Promise<MemoryRecord[]>;
  listSessionMemory(sessionId: string): Promise<MemoryRecord[]>;
  write(record: MemoryRecord): Promise<void>;
}

export interface SkillRegistry {
  listEntries(): Promise<SkillRegistryEntry[]>;
  loadSkill(skillId: string): Promise<SkillSpec>;
  setEnabled?(skillId: string, enabled: boolean): Promise<void>;
}

export interface SandboxExecutionResult {
  output?: JsonValue;
  artifact?: Artifact;
  log?: string;
}

export interface SandboxTargetRef {
  provider?: string;
  instanceId?: string;
  poolId?: string;
  baseUrl?: string;
  metadata?: Record<string, JsonValue>;
}

export interface SandboxCallInput {
  request: NormalizedRequest;
  skillId: string;
  stepId: string;
  capability: string;
  action: string;
  input: Record<string, JsonValue>;
  target?: SandboxTargetRef;
}

export interface ToolExecutionRequest {
  request: NormalizedRequest;
  skillId: string;
  stepId: string;
  tool: SkillToolActionName;
  reason: string;
  input: Record<string, JsonValue>;
}

export interface SandboxActionAdapter {
  readonly tool: SkillToolActionName;
  toSandboxCallInput(request: ToolExecutionRequest): SandboxCallInput;
}

export interface SandboxTargetResolver {
  resolve(request: NormalizedRequest): SandboxTargetRef | undefined;
}

export interface SandboxLease {
  provider: string;
  instanceId: string;
  baseUrl?: string;
  status?: string;
  metadata?: Record<string, JsonValue>;
}

export interface SandboxLifecycleManager {
  create(metadata?: Record<string, JsonValue>): Promise<SandboxLease>;
  describe(instanceId: string): Promise<SandboxLease>;
  destroy(instanceId: string): Promise<void>;
}

export interface SandboxProvider {
  readonly name: string;
  readonly capabilityPrefix: string;
  execute(input: SandboxCallInput): Promise<SandboxExecutionResult>;
}

export interface SandboxService {
  executeTool(
    request: ToolExecutionRequest,
  ): Promise<{ call: SandboxCall; result: SandboxExecutionResult }>;
  call(
    input: SandboxCallInput,
  ): Promise<{ call: SandboxCall; result: SandboxExecutionResult }>;
  listCapabilities(): string[];
}
