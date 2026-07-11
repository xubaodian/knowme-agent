import type { Artifact, Run, RunEvent, RunEventType } from "../shared/types.js";
import type { ArtifactManager } from "./artifacts/artifact-manager.js";
import type { ContextManager } from "./context/context-manager.js";
import type { AgentEventBus } from "./core/event-bus.js";
import type { LlmProvider } from "./llm/types.js";
import type { LoadedSkill } from "./skills/skill-registry.js";
import type { RunLogger } from "../logging/index.js";
import type { RunTraceRecorder } from "../logging/trace.js";
import type { SkillRegistry } from "./skills/skill-registry.js";
import type { TodoManager } from "./todos/todo-manager.js";
import type { SandboxAdapter } from "./tools/sandbox/sandbox-adapter.js";

export type TodoStatus = "pending" | "in_progress" | "completed" | "failed";

export type Todo = {
  id: string;
  title: string;
  description: string;
  expectedOutput: string;
  doneCriteria: string[];
  detail?: string;
  status: TodoStatus;
  summary?: string;
  outputSummary?: string;
  artifactRefs?: string[];
  sandboxRefs?: string[];
  fileRefs?: string[];
  evidenceRefs?: string[];
  nextContext?: string;
  missingCriteria?: string[];
};

export type PlanTodosAction = "create" | "update" | "start" | "complete" | "fail";

export type ExecutionTodoDraft = {
  id?: string;
  title: string;
  description: string;
  expectedOutput: string;
  doneCriteria?: string[];
  status?: TodoStatus;
  summary?: string;
  outputSummary?: string;
  artifactRefs?: string[];
  sandboxRefs?: string[];
  fileRefs?: string[];
  evidenceRefs?: string[];
  nextContext?: string;
  missingCriteria?: string[];
};

export type PlanTodosInput = {
  action?: PlanTodosAction;
  goal?: string;
  todos?: ExecutionTodoDraft[];
  todoId?: string;
  title?: string;
  description?: string;
  expectedOutput?: string;
  doneCriteria?: string[];
  status?: TodoStatus;
  summary?: string;
  outputSummary?: string;
  artifactRefs?: string[];
  sandboxRefs?: string[];
  fileRefs?: string[];
  evidenceRefs?: string[];
  nextContext?: string;
  missingCriteria?: string[];
};

export type ExecutionPlan = {
  goal: string;
  todos: Todo[];
};

export type ExecutionProfile =
  | {
      mode: "skill";
      skillName: string;
      skillContent: string;
      description?: string;
      path?: string;
    }
  | {
      mode: "generic";
      profileName: "general-agent";
    };

export type ExecutionNodeKind = "planning" | "skill" | "profile" | "execution_unit" | "tool" | "artifact" | "finalization";

export type ExecutionNode = {
  id: string;
  runId: string;
  parentId?: string;
  kind: ExecutionNodeKind;
  title: string;
  status: "queued" | "running" | "completed" | "failed";
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type TodoOutputRef = {
  type: "artifact" | "sandbox" | "tool";
  id?: string;
  title?: string;
  kind?: string;
  path?: string;
  url?: string;
  toolName?: string;
  summary?: string;
};

export type TodoCompletion = {
  todoId: string;
  title: string;
  completedWork: string;
  outputs: TodoOutputRef[];
  artifactRefs: string[];
  sandboxRefs: string[];
  fileRefs: string[];
  evidenceRefs: string[];
  decisions: string[];
  nextContextSummary: string;
  missingCriteria?: string[];
};

export type SharedContext = {
  runId: string;
  chatId: string;
  sourceTodoId?: string;
  sourceTodoTitle?: string;
  executionNodeId?: string;
  title: string;
  content: string;
  createdAt: string;
};

export type ContextPack = {
  userRequest: string;
  profile: ExecutionProfile;
  currentTodo: Todo;
  todoPlan: Todo[];
  previousCompletions: TodoCompletion[];
  carryForwardSummary: string;
};

export type AgentRunInput = {
  run: Run;
  prompt: string;
  workspaceRoot: string;
  skillsRoot: string;
  loadedSkill?: LoadedSkill;
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
  parentId?: string;
  nodeId?: string;
  parentNodeId?: string;
  stepId?: string;
  stepTitle?: string;
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
  loadedSkill?: LoadedSkill;
  artifactManager: ArtifactManager;
  contextManager: ContextManager;
  skillRegistry: SkillRegistry;
  sandbox: SandboxAdapter;
  todoManager: TodoManager;
  taskState: TaskStateManager;
};

export type ToolRunResult = {
  summary?: string;
  data?: unknown;
  visualInputs?: Array<{
    title?: string;
    imageUrl: string;
    detail?: "auto" | "low" | "high";
    note?: string;
  }>;
};

export type AgentTool<TInput = unknown, TOutput extends ToolRunResult = ToolRunResult> = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  run(input: TInput, context: ToolExecutionContext): Promise<TOutput>;
  summarizeInput?: (input: TInput) => string;
  summarizeOutput?: (output: TOutput) => string;
};

export type FinishedTask = {
  status: "completed" | "failed";
  answer: string;
  artifactRefs: string[];
  fileRefs: string[];
  summary: string;
};

export interface TaskStateManager {
  finish(input: FinishedTask): FinishedTask;
  getFinishedTask(): FinishedTask | undefined;
}
