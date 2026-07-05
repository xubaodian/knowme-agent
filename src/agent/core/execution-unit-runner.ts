import type { Artifact } from "../../shared/types.js";
import type { RunTraceRecorder } from "../../logging/trace.js";
import type { ArtifactManager } from "../artifacts/artifact-manager.js";
import type { ContextManager } from "../context/context-manager.js";
import type { LlmProvider } from "../llm/types.js";
import { buildExecutionPrompt } from "../prompts/runtime-prompts.js";
import type { TodoManager } from "../todos/todo-manager.js";
import type { ContextPack, ExecutionProfile, Todo, TodoCompletion, TodoOutputRef } from "../types.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ToolRunner } from "../tools/tool-runner.js";
import type { AgentLoopToolResult } from "./agent-loop.js";
import { runAgentLoop } from "./agent-loop.js";
import type { AgentEventBus } from "./event-bus.js";

const executionToolNames = [
  "plan_todos",
  "record_note",
  "read_record",
  "publish_artifact",
  "list_files",
  "read_file",
  "write_file",
  "patch_file",
  "run_command",
  "run_node",
  "run_python",
  "browser_open_file",
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_screenshot",
  "browser_get_dom"
];

export type ExecutionUnitRunnerInput = {
  prompt: string;
  profile: ExecutionProfile;
  registry: ToolRegistry;
  toolRunner: ToolRunner;
  eventBus: AgentEventBus;
  contextManager: ContextManager;
  todoManager: TodoManager;
  artifactManager: ArtifactManager;
  llmProvider: LlmProvider;
  trace?: RunTraceRecorder;
  parentTraceId?: string;
};

export class ExecutionUnitRunner {
  constructor(private readonly input: ExecutionUnitRunnerInput) {}

  async runAll(todos: Todo[]): Promise<Todo[]> {
    let currentTodos = todos;

    this.input.eventBus.runLogger.event("runtime.execution_units.start", {
      todoCount: currentTodos.length,
      todoIds: currentTodos.map((todo) => todo.id)
    });

    for (const [index, todo] of currentTodos.entries()) {
      currentTodos = await this.runOne(todo, currentTodos, index + 1, currentTodos.length);
    }

    this.input.eventBus.runLogger.event("runtime.execution_units.end", {
      todoCount: currentTodos.length,
      completionCount: this.input.contextManager.getCompletions().length
    });

    return currentTodos;
  }

  private async runOne(todo: Todo, todoPlan: Todo[], index: number, total: number): Promise<Todo[]> {
    const traceNodeId = await this.input.trace?.startNode({
      id: `unit_${todo.id}`,
      parentId: this.input.parentTraceId ?? this.input.trace.rootNodeId,
      type: "execution_unit",
      title: todo.title,
      summary: todo.description,
      input: {
        todo,
        index,
        total,
        contextPack: this.buildContextPack(todo, todoPlan)
      },
      metadata: {
        phase: "execution",
        todoId: todo.id,
        todoIndex: index,
        todoCount: total
      }
    });

    this.input.eventBus.setActiveStep({ id: todo.id, title: todo.title });
    this.input.eventBus.setActiveNode({ id: traceNodeId ?? todo.id, parentId: this.input.parentTraceId });

    try {
      this.input.eventBus.runLogger.event("runtime.execution_unit.start", {
        todoId: todo.id,
        todoTitle: todo.title,
        todoIndex: index,
        todoCount: total,
        doneCriteria: todo.doneCriteria,
        expectedOutput: todo.expectedOutput
      });

      await this.input.toolRunner.run(
        "plan_todos",
        { action: "start", todoId: todo.id },
        { traceParentId: traceNodeId, traceMetadata: { phase: "execution", todoId: todo.id } }
      );

      const artifactsBefore = this.input.artifactManager.getPublishedArtifacts().length;
      const contextPack = this.buildContextPack({ ...todo, status: "in_progress" }, this.input.todoManager.getSnapshot());
      const result = await runAgentLoop({
        name: `Execution unit ${todo.id}`,
        llmProvider: this.input.llmProvider,
        toolRegistry: this.input.registry,
        toolRunner: this.input.toolRunner,
        eventBus: this.input.eventBus,
        trace: this.input.trace,
        parentTraceId: traceNodeId,
        allowedTools: executionToolNames,
        requireFinalContent: false,
        allowSyntheticFinalContent: true,
        maxIterations: 24,
        llmMessages: [
          {
            role: "system",
            content: await buildExecutionPrompt({ contextPack })
          },
          {
            role: "user",
            content: JSON.stringify({
              instruction: "Execute only the current todo. Complete or fail it with plan_todos before stopping.",
              currentTodo: contextPack.currentTodo
            })
          }
        ]
      });
      const newArtifacts = this.input.artifactManager.getPublishedArtifacts().slice(artifactsBefore);
      let latestTodo = this.findTodo(todo.id) ?? todo;

      if (latestTodo.status !== "completed" && latestTodo.status !== "failed") {
        const fallbackCompletion = buildFallbackCompletion(latestTodo, result.content, result.toolResults, newArtifacts);
        await this.input.toolRunner.run(
          "plan_todos",
          {
            action: "complete",
            todoId: todo.id,
            summary: fallbackCompletion.completedWork,
            artifactRefs: fallbackCompletion.artifactRefs,
            sandboxRefs: fallbackCompletion.sandboxRefs,
            fileRefs: fallbackCompletion.fileRefs,
            evidenceRefs: fallbackCompletion.evidenceRefs,
            nextContext: fallbackCompletion.nextContextSummary
          },
          { traceParentId: traceNodeId, traceMetadata: { phase: "execution", todoId: todo.id, reason: "runtime_completion_fallback" } }
        );
        latestTodo = this.findTodo(todo.id) ?? latestTodo;
      }

      const completion = buildCompletionFromTodo(latestTodo, result.content, result.toolResults, newArtifacts);
      this.input.contextManager.commitTodoCompletion(completion);

      this.input.eventBus.emit({
        type: "summary.created",
        title: `Todo completed: ${todo.title}`,
        detail: completion.nextContextSummary || completion.completedWork,
        nodeId: traceNodeId,
        parentNodeId: this.input.parentTraceId,
        status: latestTodo.status === "failed" ? "failed" : "done",
        flowKind: latestTodo.status === "failed" ? "error" : "summary",
        visibility: "secondary"
      });

      await this.input.trace?.endNode(traceNodeId, {
        status: latestTodo.status === "failed" ? "error" : "success",
        summary: completion.nextContextSummary || completion.completedWork,
        output: {
          todo: latestTodo,
          completion,
          toolResults: result.toolResults,
          artifacts: newArtifacts
        }
      });
      this.input.eventBus.runLogger.event("runtime.execution_unit.end", {
        todoId: todo.id,
        status: latestTodo.status,
        completedWork: completion.completedWork,
        artifactRefs: completion.artifactRefs,
        fileRefs: completion.fileRefs,
        evidenceRefs: completion.evidenceRefs,
        sandboxRefs: completion.sandboxRefs
      });

      return this.input.todoManager.getSnapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution unit failed.";
      await this.input.toolRunner.run(
        "plan_todos",
        {
          action: "fail",
          todoId: todo.id,
          summary: message,
          missingCriteria: todo.doneCriteria
        },
        { traceParentId: traceNodeId, traceMetadata: { phase: "execution", todoId: todo.id, reason: "runtime_error" } }
      );
      await this.input.trace?.endNode(traceNodeId, {
        status: "error",
        summary: message,
        error,
        output: {
          todo: this.findTodo(todo.id)
        }
      });
      this.input.eventBus.runLogger.event(
        "runtime.execution_unit.fail",
        {
          todoId: todo.id,
          error: message
        },
        "error"
      );
      return this.input.todoManager.getSnapshot();
    } finally {
      this.input.eventBus.setActiveNode(undefined);
      this.input.eventBus.setActiveStep(undefined);
    }
  }

  private buildContextPack(todo: Todo, todoPlan: Todo[]): ContextPack {
    return this.input.contextManager.buildContextPack({
      userRequest: this.input.prompt,
      profile: this.input.profile,
      currentTodo: todo,
      todoPlan
    });
  }

  private findTodo(todoId: string): Todo | undefined {
    return this.input.todoManager.getSnapshot().find((todo) => todo.id === todoId);
  }
}

function buildCompletionFromTodo(
  todo: Todo,
  loopContent: string,
  toolResults: AgentLoopToolResult[],
  artifacts: Artifact[]
): TodoCompletion {
  const fallback = buildFallbackCompletion(todo, loopContent, toolResults, artifacts);
  const completedWork = todo.summary ?? todo.outputSummary ?? fallback.completedWork;

  return {
    todoId: todo.id,
    title: todo.title,
    completedWork,
    outputs: fallback.outputs,
    artifactRefs: normalizeRefs(todo.artifactRefs, fallback.artifactRefs),
    sandboxRefs: normalizeRefs(todo.sandboxRefs, fallback.sandboxRefs),
    fileRefs: normalizeRefs(todo.fileRefs, fallback.fileRefs),
    evidenceRefs: normalizeRefs(todo.evidenceRefs, fallback.evidenceRefs),
    decisions: [],
    nextContextSummary: todo.nextContext ?? completedWork,
    missingCriteria: todo.missingCriteria
  };
}

function buildFallbackCompletion(
  todo: Todo,
  loopContent: string,
  toolResults: AgentLoopToolResult[],
  artifacts: Artifact[]
): TodoCompletion {
  const outputs = deriveOutputRefs(artifacts, toolResults);
  const artifactRefs = outputs
    .filter((ref) => ref.type === "artifact")
    .map((ref) => ref.id ?? ref.title)
    .filter((value): value is string => Boolean(value));
  const sandboxRefs = outputs
    .filter((ref) => ref.type === "sandbox")
    .map((ref) => ref.path ?? ref.url ?? ref.summary)
    .filter((value): value is string => Boolean(value));
  const fileRefs = outputs
    .filter((ref) => ref.type === "sandbox" && ref.path)
    .map((ref) => ref.path)
    .filter((value): value is string => Boolean(value));
  const evidenceRefs = outputs
    .filter((ref) => ref.type === "tool" || ref.url)
    .map((ref) => ref.url ?? ref.summary ?? ref.toolName)
    .filter((value): value is string => Boolean(value));
  const completedWork = loopContent.trim() || `Completed ${todo.title}.`;

  return {
    todoId: todo.id,
    title: todo.title,
    completedWork,
    outputs,
    artifactRefs,
    sandboxRefs,
    fileRefs,
    evidenceRefs,
    decisions: [],
    nextContextSummary: completedWork
  };
}

function deriveOutputRefs(artifacts: Artifact[], toolResults: AgentLoopToolResult[]): TodoOutputRef[] {
  return [
    ...artifacts.map<TodoOutputRef>((artifact) => ({
      type: "artifact",
      id: artifact.id,
      title: artifact.title,
      kind: artifact.kind,
      summary: artifact.description
    })),
    ...toolResults.map<TodoOutputRef>((toolResult) => ({
      type: inferToolOutputType(toolResult.toolName),
      toolName: toolResult.toolName,
      path: readToolPath(toolResult.data),
      url: readToolUrl(toolResult.data),
      summary: toolResult.summary ?? toolResult.error,
      kind: toolResult.ok ? "success" : "error"
    }))
  ];
}

function inferToolOutputType(toolName: string): TodoOutputRef["type"] {
  if (toolName === "publish_artifact") {
    return "artifact";
  }

  if (
    toolName === "list_files" ||
    toolName === "read_file" ||
    toolName === "write_file" ||
    toolName === "patch_file" ||
    toolName.startsWith("browser_")
  ) {
    return "sandbox";
  }

  return "tool";
}

function readToolPath(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  if ("path" in data && typeof data.path === "string") {
    return data.path;
  }

  if ("artifact" in data && data.artifact && typeof data.artifact === "object" && "metadata" in data.artifact) {
    const metadata = data.artifact.metadata;
    return metadata && typeof metadata === "object" && "sourcePath" in metadata && typeof metadata.sourcePath === "string"
      ? metadata.sourcePath
      : undefined;
  }

  return undefined;
}

function readToolUrl(data: unknown): string | undefined {
  return data && typeof data === "object" && "url" in data && typeof data.url === "string" ? data.url : undefined;
}

function normalizeRefs(value: string[] | undefined, fallback: string[]): string[] {
  return value?.length ? value : fallback;
}
