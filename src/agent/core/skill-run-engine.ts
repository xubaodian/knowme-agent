import type { Artifact } from "../../shared/types.js";
import type { RunTraceRecorder } from "../../logging/trace.js";
import { completeWithLogging } from "../llm/llm-runner.js";
import type { LlmProvider } from "../llm/types.js";
import {
  buildFinalReplySystemPrompt,
  buildPlanningSystemPrompt,
  buildTodoCompletionSummarySystemPrompt,
  buildTodoExecutionSystemPrompt
} from "../prompts/index.js";
import type { LoadedSkill } from "../skills/skill-registry.js";
import type { TodoManager } from "../todos/todo-manager.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ToolRunner } from "../tools/tool-runner.js";
import type { AgentLoopToolResult } from "./agent-loop.js";
import { runAgentLoop } from "./agent-loop.js";
import type { AgentEventBus } from "./event-bus.js";
import type { ArtifactManager } from "../artifacts/artifact-manager.js";
import type { ContextManager } from "../context/context-manager.js";
import type { ContextPack, Todo, TodoCompletion, TodoOutputRef } from "../types.js";

const executionToolNames = [
  "read_skill_file",
  "read_file",
  "write_file",
  "patch_file",
  "execute_command",
  "execute_code",
  "browser_open_file",
  "browser_navigate",
  "browser_screenshot",
  "create_artifact"
];

export type SkillRunEngineInput = {
  prompt: string;
  loadedSkill: LoadedSkill;
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

export type SkillRunEngineResult = {
  reply: string;
  todos: Todo[];
  completions: TodoCompletion[];
};

export class SkillRunEngine {
  constructor(private readonly input: SkillRunEngineInput) {}

  async run(): Promise<SkillRunEngineResult> {
    const engineTraceNodeId = await this.input.trace?.startNode({
      parentId: this.input.parentTraceId ?? this.input.trace.rootNodeId,
      type: "phase",
      title: "Skill run engine",
      summary: "Plan todos, execute each todo as an isolated sub-agent, and finalize.",
      input: {
        prompt: this.input.prompt,
        loadedSkill: this.input.loadedSkill
          ? {
              name: this.input.loadedSkill.name,
              description: this.input.loadedSkill.description,
              path: this.input.loadedSkill.path
            }
          : undefined
      },
      metadata: {
        skillName: this.input.loadedSkill.name
      }
    });

    try {
      const plannedTodos = await this.planTodos(engineTraceNodeId);
      const todos = await this.executeTodos(plannedTodos, engineTraceNodeId);
      const reply = await this.createFinalReply(todos, engineTraceNodeId);
      const completions = this.input.contextManager.getCompletions();

      await this.input.trace?.endNode(engineTraceNodeId, {
        status: "success",
        summary: "Skill run completed.",
        output: {
          todos,
          completions,
          reply
        }
      });

      return {
        reply,
        todos,
        completions
      };
    } catch (error) {
      await this.input.trace?.endNode(engineTraceNodeId, {
        status: "error",
        summary: error instanceof Error ? error.message : "Skill run failed.",
        error
      });
      throw error;
    }
  }

  private async planTodos(parentTraceId?: string): Promise<Todo[]> {
    const runLogger = this.input.eventBus.runLogger;

    runLogger.event("skill_run.plan.start", {
      skillName: this.input.loadedSkill.name
    });
    await runAgentLoop({
      name: "Todo planner",
      llmProvider: this.input.llmProvider,
      toolRegistry: this.input.registry,
      toolRunner: this.input.toolRunner,
      eventBus: this.input.eventBus,
      trace: this.input.trace,
      parentTraceId,
      allowedTools: ["write_todos"],
      toolChoice: "required",
      maxIterations: 6,
      llmMessages: [
        { role: "system", content: buildPlanningSystemPrompt(this.input.loadedSkill.content) },
        { role: "user", content: this.input.prompt }
      ]
    });

    const plannedTodos = normalizeTodoPlan(this.input.todoManager.getSnapshot(), this.input.prompt, this.input.loadedSkill);
    await this.input.toolRunner.run("write_todos", { todos: plannedTodos }, { traceParentId: parentTraceId });
    runLogger.event("skill_run.plan.end", {
      todoCount: plannedTodos.length,
      todoIds: plannedTodos.map((todo) => todo.id),
      todoTitles: plannedTodos.map((todo) => todo.title),
      expectedOutputs: plannedTodos.map((todo) => todo.expectedOutput)
    });

    return plannedTodos;
  }

  private async executeTodos(plannedTodos: Todo[], parentTraceId?: string): Promise<Todo[]> {
    let todos = plannedTodos;
    const runLogger = this.input.eventBus.runLogger;

    runLogger.event("skill_run.todos.start", {
      todoCount: todos.length,
      todoIds: todos.map((todo) => todo.id)
    });

    for (const [index, todo] of todos.entries()) {
      const todoTraceNodeId = await this.input.trace?.startNode({
        parentId: parentTraceId ?? this.input.trace.rootNodeId,
        type: "todo",
        title: todo.title,
        summary: todo.description,
        input: {
          todo,
          index: index + 1,
          total: todos.length,
          contextPack: this.buildContextPack(todo, todos)
        },
        metadata: {
          todoId: todo.id,
          todoIndex: index + 1,
          todoCount: todos.length,
          expectedOutput: todo.expectedOutput
        }
      });

      runLogger.event("skill_run.todo.start", {
        todoId: todo.id,
        todoTitle: todo.title,
        todoIndex: index + 1,
        todoCount: todos.length,
        expectedOutput: todo.expectedOutput,
        previousCompletionCount: this.input.contextManager.getCompletions().length
      });
      this.input.eventBus.setActiveStep({ id: todo.id, title: todo.title });

      try {
        todos = withTodoStatus(todos, todo.id, "in_progress");
        await this.input.toolRunner.run("write_todos", { todos }, { traceParentId: todoTraceNodeId });

        const contextPack = this.buildContextPack(todo, todos);
        const artifactStartIndex = this.input.artifactManager.getPublishedArtifacts().length;
        const result = await runAgentLoop({
          name: `Todo ${todo.id}`,
          llmProvider: this.input.llmProvider,
          toolRegistry: this.input.registry,
          toolRunner: this.input.toolRunner,
          eventBus: this.input.eventBus,
          trace: this.input.trace,
          parentTraceId: todoTraceNodeId,
          allowedTools: executionToolNames,
          requireFinalContent: true,
          allowSyntheticFinalContent: true,
          llmMessages: [
            {
              role: "system",
              content: buildTodoExecutionSystemPrompt({
                skillContent: this.input.loadedSkill.content,
                contextPack
              })
            },
            {
              role: "user",
              content: JSON.stringify({
                instruction: "Execute only the current todo using the provided context pack.",
                contextPack
              })
            }
          ]
        });
        const newArtifacts = this.input.artifactManager.getPublishedArtifacts().slice(artifactStartIndex);
        const completion = await this.summarizeTodoCompletion({
          todo,
          contextPack,
          loopContent: result.content,
          toolResults: result.toolResults,
          artifacts: newArtifacts,
          parentTraceId: todoTraceNodeId
        });

        this.input.contextManager.commitTodoCompletion(completion);
        todos = withTodoStatus(todos, todo.id, "completed", {
          outputSummary: completion.nextContextSummary || completion.completedWork,
          artifactRefs: completion.artifactRefs,
          sandboxRefs: completion.sandboxRefs
        });
        await this.input.toolRunner.run("write_todos", { todos }, { traceParentId: todoTraceNodeId });
        this.input.eventBus.emit({
          type: "summary.created",
          title: `Todo completed: ${todo.title}`,
          detail: completion.nextContextSummary || completion.completedWork,
          status: "done",
          flowKind: "summary",
          visibility: "secondary"
        });
        await this.input.trace?.endNode(todoTraceNodeId, {
          status: "success",
          summary: completion.nextContextSummary || completion.completedWork,
          output: {
            todo: todos.find((item) => item.id === todo.id),
            completion,
            toolResults: result.toolResults,
            artifacts: newArtifacts
          }
        });
        runLogger.event("skill_run.todo.end", {
          todoId: todo.id,
          todoTitle: todo.title,
          completedWork: completion.completedWork,
          artifactRefs: completion.artifactRefs,
          sandboxRefs: completion.sandboxRefs
        });
        this.input.eventBus.setActiveStep(undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Todo execution failed.";
        todos = withTodoStatus(todos, todo.id, "failed", { outputSummary: message });
        await this.input.toolRunner.run("write_todos", { todos }, { traceParentId: todoTraceNodeId });
        await this.input.trace?.endNode(todoTraceNodeId, {
          status: "error",
          summary: message,
          error,
          output: {
            todo: todos.find((item) => item.id === todo.id)
          }
        });
        runLogger.event(
          "skill_run.todo.fail",
          {
            todoId: todo.id,
            todoTitle: todo.title,
            error: message
          },
          "error"
        );
        this.input.eventBus.setActiveStep(undefined);
        throw error;
      }
    }

    runLogger.event("skill_run.todos.end", {
      todoCount: todos.length,
      completionCount: this.input.contextManager.getCompletions().length
    });

    return todos;
  }

  private buildContextPack(todo: Todo, todoPlan: Todo[]): ContextPack {
    return this.input.contextManager.buildContextPack({
      userRequest: this.input.prompt,
      skill: {
        name: this.input.loadedSkill.name,
        description: this.input.loadedSkill.description
      },
      currentTodo: todo,
      todoPlan
    });
  }

  private async summarizeTodoCompletion(input: {
    todo: Todo;
    contextPack: ContextPack;
    loopContent: string;
    toolResults: AgentLoopToolResult[];
    artifacts: Artifact[];
    parentTraceId?: string;
  }): Promise<TodoCompletion> {
    const derivedRefs = deriveOutputRefs(input.artifacts, input.toolResults);
    const response = await completeWithLogging({
      provider: this.input.llmProvider,
      runLogger: this.input.eventBus.runLogger,
      trace: this.input.trace,
      traceParentId: input.parentTraceId,
      phase: `todo-summary:${input.todo.id}`,
      request: {
        temperature: 0,
        messages: [
          {
            role: "system",
            content: buildTodoCompletionSummarySystemPrompt()
          },
          {
            role: "user",
            content: JSON.stringify({
              todo: input.todo,
              contextPack: input.contextPack,
              loopCompletionNote: input.loopContent,
              toolResults: input.toolResults,
              artifacts: input.artifacts,
              derivedRefs
            })
          }
        ]
      }
    });
    const parsed = parseCompletionJson(response.content);
    const fallback = buildFallbackCompletion(input.todo, input.loopContent, derivedRefs);
    const completion: TodoCompletion = {
      todoId: input.todo.id,
      title: input.todo.title,
      completedWork: ensureString(parsed.completedWork, fallback.completedWork),
      outputs: normalizeOutputs(parsed.outputs, fallback.outputs),
      artifactRefs: normalizeStringArray(parsed.artifactRefs, fallback.artifactRefs),
      sandboxRefs: normalizeStringArray(parsed.sandboxRefs, fallback.sandboxRefs),
      decisions: normalizeStringArray(parsed.decisions, fallback.decisions),
      nextContextSummary: ensureString(parsed.nextContextSummary, fallback.nextContextSummary)
    };

    this.input.eventBus.runLogger.event("skill_run.todo.summary", {
      todoId: completion.todoId,
      completedWork: completion.completedWork,
      artifactRefs: completion.artifactRefs,
      sandboxRefs: completion.sandboxRefs,
      decisionCount: completion.decisions.length,
      outputCount: completion.outputs.length
    });

    return completion;
  }

  private async createFinalReply(todos: Todo[], parentTraceId?: string): Promise<string> {
    const completions = this.input.contextManager.getCompletions();
    const response = await completeWithLogging({
      provider: this.input.llmProvider,
      runLogger: this.input.eventBus.runLogger,
      trace: this.input.trace,
      traceParentId: parentTraceId,
      phase: "final-reply",
      request: {
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: buildFinalReplySystemPrompt(this.input.loadedSkill.content)
          },
          {
            role: "user",
            content: JSON.stringify({
              userRequest: this.input.prompt,
              skill: {
                name: this.input.loadedSkill.name,
                description: this.input.loadedSkill.description
              },
              todos,
              todoCompletions: completions
            })
          }
        ]
      }
    });

    return response.content.trim() || "任务已完成。";
  }
}

function normalizeTodoPlan(todos: Todo[], prompt: string, loadedSkill: LoadedSkill): Todo[] {
  const plannedTodos = todos.length > 0 ? todos : [createFallbackTodo(prompt, loadedSkill)];

  return plannedTodos.map((todo, index) => ({
    ...todo,
    id: todo.id.trim() || `todo-${index + 1}`,
    title: todo.title.trim() || `Todo ${index + 1}`,
    description: todo.description?.trim() || todo.detail?.trim() || "Complete this step of the user request.",
    expectedOutput: todo.expectedOutput?.trim() || "A concrete completion summary with any produced refs.",
    status: "pending",
    artifactRefs: todo.artifactRefs ? [...todo.artifactRefs] : undefined,
    sandboxRefs: todo.sandboxRefs ? [...todo.sandboxRefs] : undefined
  }));
}

function createFallbackTodo(prompt: string, loadedSkill: LoadedSkill): Todo {
  return {
    id: "execute-request",
    title: `Execute ${loadedSkill.name}`,
    description: "Complete the user's request as one isolated executable todo.",
    expectedOutput: `A completed result for: ${prompt.slice(0, 160)}`,
    status: "pending"
  };
}

function withTodoStatus(
  todos: Todo[],
  todoId: string,
  status: Todo["status"],
  output?: Partial<Pick<Todo, "outputSummary" | "artifactRefs" | "sandboxRefs" | "detail">>
): Todo[] {
  return todos.map((todo) =>
    todo.id === todoId
      ? {
          ...todo,
          status,
          detail: output?.detail ?? todo.detail,
          outputSummary: output?.outputSummary ?? todo.outputSummary,
          artifactRefs: output?.artifactRefs ?? todo.artifactRefs,
          sandboxRefs: output?.sandboxRefs ?? todo.sandboxRefs
        }
      : todo
  );
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
  if (toolName === "read_skill_file") {
    return "tool";
  }

  return ["read_file", "write_file", "patch_file", "browser_open_file", "browser_navigate", "browser_screenshot", "execute_command", "execute_code"].includes(
    toolName
  )
    ? "sandbox"
    : "tool";
}

function readToolPath(data: unknown): string | undefined {
  return data && typeof data === "object" && "path" in data && typeof data.path === "string" ? data.path : undefined;
}

function readToolUrl(data: unknown): string | undefined {
  return data && typeof data === "object" && "url" in data && typeof data.url === "string" ? data.url : undefined;
}

function parseCompletionJson(content: string): Partial<TodoCompletion> {
  const trimmed = content.trim();
  const jsonText = trimmed.startsWith("```") ? extractFencedJson(trimmed) : trimmed;

  try {
    return JSON.parse(jsonText) as Partial<TodoCompletion>;
  } catch {
    return {};
  }
}

function extractFencedJson(content: string): string {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match?.[1] ?? content;
}

function buildFallbackCompletion(todo: Todo, loopContent: string, outputRefs: TodoOutputRef[]): TodoCompletion {
  const artifactRefs = outputRefs
    .filter((ref) => ref.type === "artifact")
    .map((ref) => ref.id ?? ref.title)
    .filter((value): value is string => Boolean(value));
  const sandboxRefs = outputRefs
    .filter((ref) => ref.type === "sandbox")
    .map((ref) => ref.path ?? ref.url ?? ref.summary)
    .filter((value): value is string => Boolean(value));
  const completedWork = loopContent.trim() || `Completed ${todo.title}.`;

  return {
    todoId: todo.id,
    title: todo.title,
    completedWork,
    outputs: outputRefs,
    artifactRefs,
    sandboxRefs,
    decisions: [],
    nextContextSummary: completedWork
  };
}

function ensureString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeOutputs(value: unknown, fallback: TodoOutputRef[]): TodoOutputRef[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      type: item.type === "artifact" || item.type === "sandbox" || item.type === "tool" ? item.type : "tool",
      id: typeof item.id === "string" ? item.id : undefined,
      title: typeof item.title === "string" ? item.title : undefined,
      kind: typeof item.kind === "string" ? item.kind : undefined,
      path: typeof item.path === "string" ? item.path : undefined,
      url: typeof item.url === "string" ? item.url : undefined,
      toolName: typeof item.toolName === "string" ? item.toolName : undefined,
      summary: typeof item.summary === "string" ? item.summary : undefined
    }));
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}
