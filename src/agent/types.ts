import type { Artifact, Run, RunEvent, RunEventType } from "../shared/types.js";
import type { ArtifactManager } from "./artifacts/artifact-manager.js";
import type { AgentEventBus } from "./core/event-bus.js";
import type { LlmProvider } from "./llm/types.js";
import type { RunLogger } from "../logging/index.js";
import type { RunTraceRecorder } from "../logging/trace.js";
import type { SkillRegistry } from "./skills/skill-registry.js";
import type { TodoManager } from "./todos/todo-manager.js";
import type { SandboxAdapter } from "./tools/sandbox/sandbox-adapter.js";

export type TodoStatus = "pending" | "in_progress" | "completed" | "failed";

export type Todo = {
  id: string;
  title: string;
  detail?: string;
  status: TodoStatus;
};

export type WriteTodosInput = {
  todos: Todo[];
};

export type AgentRunInput = {
  run: Run;
  prompt: string;
  workspaceRoot: string;
  skillsRoot: string;
  llmProvider?: LlmProvider;
  runLogger?: RunLogger;
  trace?: RunTraceRecorder;
  onEvent: (event: RunEvent) => void;
  onArtifact: (artifact: Artifact) => void;
};

export type AgentRunResult = {
  reply: string;
};

export type AgentEventDraft = {
  type: RunEventType;
  title: string;
  detail?: string;
  status?: RunEvent["status"];
  flowKind?: RunEvent["flowKind"];
  visibility?: RunEvent["visibility"];
  actions?: RunEvent["actions"];
  artifactId?: string;
  payload?: RunEvent["payload"];
};

export type ToolExecutionContext = {
  run: Run;
  prompt: string;
  workspaceRoot: string;
  eventBus: AgentEventBus;
  llmProvider: LlmProvider;
  runLogger: RunLogger;
  trace?: RunTraceRecorder;
  artifactManager: ArtifactManager;
  skillRegistry: SkillRegistry;
  sandbox: SandboxAdapter;
  todoManager: TodoManager;
};

export type ToolRunResult = {
  summary?: string;
  data?: unknown;
};

export type AgentTool<TInput = unknown, TOutput extends ToolRunResult = ToolRunResult> = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  run(input: TInput, context: ToolExecutionContext): Promise<TOutput>;
  summarizeInput?: (input: TInput) => string;
  summarizeOutput?: (output: TOutput) => string;
};
