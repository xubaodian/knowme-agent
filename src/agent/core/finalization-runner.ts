import type { ArtifactManager } from "../artifacts/artifact-manager.js";
import type { ContextManager } from "../context/context-manager.js";
import type { LlmProvider } from "../llm/types.js";
import { buildFinalizationPrompt } from "../prompts/runtime-prompts.js";
import type { FinishedTask, ExecutionProfile, Todo } from "../types.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ToolRunner } from "../tools/tool-runner.js";
import type { RunTraceRecorder } from "../../logging/trace.js";
import { runAgentLoop } from "./agent-loop.js";
import type { AgentEventBus } from "./event-bus.js";

export type FinalizationRunnerInput = {
  profile: ExecutionProfile;
  goal: string;
  todos: Todo[];
  registry: ToolRegistry;
  toolRunner: ToolRunner;
  eventBus: AgentEventBus;
  contextManager: ContextManager;
  artifactManager: ArtifactManager;
  taskState: { getFinishedTask(): FinishedTask | undefined };
  llmProvider: LlmProvider;
  trace?: RunTraceRecorder;
  parentTraceId?: string;
};

export class FinalizationRunner {
  constructor(private readonly input: FinalizationRunnerInput) {}

  async run(): Promise<FinishedTask> {
    const traceNodeId = await this.input.trace?.startNode({
      parentId: this.input.parentTraceId ?? this.input.trace.rootNodeId,
      type: "finalization",
      title: "Finalization",
      summary: "Create the final task answer with finish_task.",
      input: {
        goal: this.input.goal,
        todos: this.input.todos,
        artifactCount: this.input.artifactManager.getPublishedArtifacts().length
      },
      metadata: {
        phase: "finalization"
      }
    });
    this.input.eventBus.setActiveNode({ id: traceNodeId ?? "finalization", parentId: this.input.parentTraceId });

    try {
      this.input.eventBus.runLogger.event("runtime.finalization.start", {
        goal: this.input.goal,
        todoCount: this.input.todos.length,
        artifactCount: this.input.artifactManager.getPublishedArtifacts().length
      });
      const result = await runAgentLoop({
        name: "Finalization",
        llmProvider: this.input.llmProvider,
        toolRegistry: this.input.registry,
        toolRunner: this.input.toolRunner,
        eventBus: this.input.eventBus,
        trace: this.input.trace,
        parentTraceId: traceNodeId,
        allowedTools: ["finish_task"],
        toolChoice: "required",
        maxIterations: 6,
        llmMessages: [
          {
            role: "system",
            content: await buildFinalizationPrompt({
              profile: this.input.profile,
              goal: this.input.goal,
              todos: this.input.todos,
              artifacts: this.input.artifactManager.getPublishedArtifacts(),
              carryForwardSummary: this.input.contextManager.getSharedSummary()
            })
          },
          {
            role: "user",
            content: "Finalize this task now by calling finish_task."
          }
        ]
      });
      let finished = this.input.taskState.getFinishedTask();

      if (!finished) {
        finished = await this.finishFallback(result.content, traceNodeId);
      }

      this.input.eventBus.runLogger.event("runtime.finalization.end", {
        status: finished.status,
        answerChars: finished.answer.length,
        artifactRefs: finished.artifactRefs,
        fileRefs: finished.fileRefs
      });
      await this.input.trace?.endNode(traceNodeId, {
        status: finished.status === "completed" ? "success" : "error",
        summary: finished.summary,
        output: finished
      });
      return finished;
    } catch (error) {
      await this.input.trace?.endNode(traceNodeId, {
        status: "error",
        summary: error instanceof Error ? error.message : "Finalization failed.",
        error
      });
      throw error;
    } finally {
      this.input.eventBus.setActiveNode(undefined);
    }
  }

  private async finishFallback(content: string, parentTraceId?: string): Promise<FinishedTask> {
    const completedTodos = this.input.todos.filter((todo) => todo.status === "completed");
    const failedTodos = this.input.todos.filter((todo) => todo.status === "failed");
    const status = failedTodos.length > 0 ? "failed" : "completed";
    const answer = content.trim() || (status === "completed" ? "任务已完成。" : "任务未完全完成。");
    const artifactRefs = [...new Set(this.input.todos.flatMap((todo) => todo.artifactRefs ?? []))];
    const fileRefs = [...new Set(this.input.todos.flatMap((todo) => todo.fileRefs ?? []))];
    const output = await this.input.toolRunner.run(
      "finish_task",
      {
        status,
        answer,
        artifactRefs,
        fileRefs,
        summary: `${completedTodos.length}/${this.input.todos.length} todos completed.`
      },
      { traceParentId: parentTraceId, traceMetadata: { phase: "finalization", reason: "runtime_finish_fallback" } }
    );

    return (output.data as { finishedTask: FinishedTask }).finishedTask;
  }
}
