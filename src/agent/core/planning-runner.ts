import { runAgentLoop } from "./agent-loop.js";
import type { AgentEventBus } from "./event-bus.js";
import type { RunTraceRecorder } from "../../logging/trace.js";
import type { LlmProvider } from "../llm/types.js";
import { buildPlanningPrompt } from "../prompts/runtime-prompts.js";
import type { ExecutionPlan, ExecutionProfile, Todo } from "../types.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ToolRunner } from "../tools/tool-runner.js";
import type { TodoManager } from "../todos/todo-manager.js";

export type PlanningRunnerInput = {
  prompt: string;
  profile: ExecutionProfile;
  registry: ToolRegistry;
  toolRunner: ToolRunner;
  eventBus: AgentEventBus;
  todoManager: TodoManager;
  llmProvider: LlmProvider;
  trace?: RunTraceRecorder;
  parentTraceId?: string;
};

export class PlanningRunner {
  constructor(private readonly input: PlanningRunnerInput) {}

  async run(): Promise<ExecutionPlan> {
    const traceNodeId = await this.input.trace?.startNode({
      parentId: this.input.parentTraceId ?? this.input.trace.rootNodeId,
      type: "planning",
      title: "Planning",
      summary: "Create the execution plan with plan_todos.",
      input: {
        prompt: this.input.prompt,
        profile: summarizeProfile(this.input.profile)
      },
      metadata: {
        phase: "planning",
        profileMode: this.input.profile.mode
      }
    });
    this.input.eventBus.setActiveNode({ id: traceNodeId ?? "planning", parentId: this.input.parentTraceId });

    try {
      this.input.eventBus.runLogger.event("runtime.planning.start", {
        profile: summarizeProfile(this.input.profile)
      });
      this.input.eventBus.emit({
        type: "thought.created",
        title: "规划任务",
        detail: "正在根据用户请求生成执行计划。",
        nodeId: traceNodeId,
        parentNodeId: this.input.parentTraceId,
        status: "running",
        flowKind: "thought",
        visibility: "primary"
      });

      await runAgentLoop({
        name: "Planning",
        llmProvider: this.input.llmProvider,
        toolRegistry: this.input.registry,
        toolRunner: this.input.toolRunner,
        eventBus: this.input.eventBus,
        trace: this.input.trace,
        parentTraceId: traceNodeId,
        allowedTools: ["plan_todos"],
        toolChoice: "required",
        maxIterations: 6,
        llmMessages: [
          { role: "system", content: await buildPlanningPrompt({ profile: this.input.profile }) },
          { role: "user", content: this.input.prompt }
        ]
      });

      const plan = await this.ensurePlan(traceNodeId);
      this.input.eventBus.runLogger.event("runtime.planning.end", {
        goal: plan.goal,
        todoCount: plan.todos.length,
        todoIds: plan.todos.map((todo) => todo.id),
        todoTitles: plan.todos.map((todo) => todo.title)
      });
      await this.input.trace?.endNode(traceNodeId, {
        status: "success",
        summary: `Planned ${plan.todos.length} execution unit(s).`,
        output: plan
      });
      return plan;
    } catch (error) {
      await this.input.trace?.endNode(traceNodeId, {
        status: "error",
        summary: error instanceof Error ? error.message : "Planning failed.",
        error
      });
      throw error;
    } finally {
      this.input.eventBus.setActiveNode(undefined);
    }
  }

  private async ensurePlan(parentTraceId?: string): Promise<ExecutionPlan> {
    let plan = this.input.todoManager.getPlan();

    if (plan.todos.length === 0) {
      const fallback = createFallbackTodo(this.input.prompt);
      const result = await this.input.toolRunner.run(
        "plan_todos",
        {
          action: "create",
          goal: this.input.prompt.slice(0, 200),
          todos: [fallback]
        },
        { traceParentId: parentTraceId, traceMetadata: { phase: "planning", reason: "fallback_plan" } }
      );
      plan = result.data as ExecutionPlan;
    }

    if (!plan.goal.trim()) {
      const result = await this.input.toolRunner.run(
        "plan_todos",
        {
          action: "update",
          goal: this.input.prompt.slice(0, 200)
        },
        { traceParentId: parentTraceId, traceMetadata: { phase: "planning", reason: "fallback_goal" } }
      );
      plan = result.data as ExecutionPlan;
    }

    return plan;
  }
}

function createFallbackTodo(prompt: string): Omit<Todo, "status"> {
  return {
    id: "execute-request",
    title: "Execute request",
    description: "Complete the user request as one isolated execution unit.",
    expectedOutput: `A concrete completed result for: ${prompt.slice(0, 160)}`,
    doneCriteria: ["The requested work is completed through tools.", "A concise summary or deliverable is recorded."]
  };
}

function summarizeProfile(profile: ExecutionProfile) {
  return profile.mode === "skill"
    ? {
        mode: profile.mode,
        skillName: profile.skillName,
        description: profile.description,
        path: profile.path
      }
    : profile;
}

