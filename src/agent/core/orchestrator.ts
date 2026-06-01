import { ArtifactManager } from "../artifacts/artifact-manager.js";
import { ContextManager } from "../context/context-manager.js";
import { createRunLogger, getLogger } from "../../logging/index.js";
import { createLlmProviderFromEnv } from "../llm/provider-factory.js";
import { completeWithLogging } from "../llm/llm-runner.js";
import {
  buildDirectExecutionSystemPrompt,
  buildFinalReplySystemPrompt,
  buildPlanningSystemPrompt as buildAgentPlanningSystemPrompt,
  buildTodoExecutionSystemPrompt
} from "../prompts/index.js";
import type { LoadedSkill } from "../skills/skill-registry.js";
import { SkillRegistry } from "../skills/skill-registry.js";
import { TodoManager } from "../todos/todo-manager.js";
import { createArtifactTools } from "../tools/artifact-tools.js";
import { createSkillTools } from "../tools/skill-tools.js";
import { LocalSandboxAdapter } from "../tools/sandbox/local-sandbox-adapter.js";
import { createSandboxTools } from "../tools/sandbox/sandbox-tools.js";
import { createTodoTools } from "../tools/todo-tools.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { ToolRunner } from "../tools/tool-runner.js";
import type { AgentRunInput, AgentRunResult, Todo } from "../types.js";
import { runAgentLoop } from "./agent-loop.js";
import { AgentEventBus } from "./event-bus.js";
import { selectAndLoadSkill } from "./skill-selector.js";

const executionToolNames = [
  "load_skill",
  "read_file",
  "write_file",
  "patch_file",
  "execute_command",
  "execute_code",
  "browser_navigate",
  "browser_screenshot",
  "create_artifact"
];

export class AgentOrchestrator {
  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const runLogger = input.runLogger ?? createRunLogger(
      {
        runId: input.run.id,
        chatId: input.run.chatId,
        userMessageId: input.run.userMessageId
      },
      getLogger()
    );
    const runSpan = runLogger.startSpan("agent.run", {
      workspaceRoot: input.workspaceRoot,
      skillsRoot: input.skillsRoot,
      promptLength: input.prompt.length
    });
    const eventBus = new AgentEventBus(input.run, input.onEvent, runLogger);
    const skillRegistry = new SkillRegistry(input.skillsRoot);
    const todoManager = new TodoManager(eventBus);
    const contextManager = new ContextManager();
    const artifactManager = new ArtifactManager(input.run, eventBus, input.onArtifact);
    const llmProvider = input.llmProvider ?? createLlmProviderFromEnv();
    const sandbox = new LocalSandboxAdapter(input.workspaceRoot);
    const registry = new ToolRegistry();
    const runtimeTraceNodeId = await input.trace?.startNode({
      parentId: input.trace.rootNodeId,
      type: "phase",
      title: "Agent runtime",
      summary: "Prepare provider, skills, tools, and execution loop.",
      input: {
        prompt: input.prompt,
        run: input.run,
        workspaceRoot: input.workspaceRoot,
        skillsRoot: input.skillsRoot
      },
      metadata: {
        workspaceRoot: input.workspaceRoot,
        skillsRoot: input.skillsRoot
      }
    });

    registry.registerMany([
      ...createTodoTools(),
      ...createSkillTools(),
      ...createArtifactTools(),
      ...createSandboxTools()
    ]);
    runLogger.event("tool.registry.ready", {
      toolCount: registry.list().length,
      toolNames: registry.list().map((tool) => tool.name)
    });

    const toolRunner = new ToolRunner(registry, {
      run: input.run,
      prompt: input.prompt,
      workspaceRoot: input.workspaceRoot,
      eventBus,
      llmProvider,
      runLogger,
      trace: input.trace,
      artifactManager,
      skillRegistry,
      sandbox,
      todoManager
    });

    eventBus.emit({
      type: "run.started",
      title: "Run started",
      detail: "Agent Runtime 已启动，正在准备 LLM、Skill 和工具执行环境。",
      status: "running",
      flowKind: "status",
      visibility: "secondary"
    });

    const llmStatus = llmProvider.getStatus();
    runLogger.event("llm.provider.status", {
      provider: llmStatus.provider,
      model: llmStatus.model,
      configured: llmStatus.configured,
      availableModelCount: llmStatus.availableModels?.length ?? 0,
      availableModelIds: llmStatus.availableModels?.map((model) => model.id)
    });
    eventBus.emit({
      type: "thought.created",
      title: llmStatus.configured ? "LLM provider ready" : "LLM provider missing",
      detail: llmStatus.configured
        ? `已启用 ${llmStatus.provider}，默认模型：${llmStatus.model}。`
        : llmStatus.reason,
      status: llmStatus.configured ? "done" : "failed",
      flowKind: llmStatus.configured ? "thought" : "error",
      visibility: "primary"
    });

    if (!llmStatus.configured) {
      const error = new Error(llmStatus.reason ?? "LLM provider is required for agent execution.");
      await input.trace?.endNode(runtimeTraceNodeId, {
        status: "error",
        error
      });
      runSpan.fail(error);
      throw error;
    }

    try {
      const skillsResult = await toolRunner.run("list_skills", {}, { traceParentId: runtimeTraceNodeId });
      const skills = Array.isArray(skillsResult.data)
        ? (skillsResult.data as Array<{ name: string; description: string; directory: string }>)
        : [];
      runLogger.event("skill.listed", {
        skillCount: skills.length,
        skillNames: skills.map((skill) => skill.name)
      });
      const loadedSkill = await selectAndLoadSkill({
        prompt: input.prompt,
        skills,
        llmProvider,
        toolRunner,
        eventBus,
        trace: input.trace,
        parentTraceId: runtimeTraceNodeId
      });
      runLogger.event("skill.selected", {
        skillName: loadedSkill?.name ?? "none"
      });

      await this.askModelForTodoPlan(input.prompt, loadedSkill, registry, toolRunner, eventBus, llmProvider, input.trace, runtimeTraceNodeId);
      const plannedTodos = normalizeTodoPlan(todoManager.getSnapshot());
      runLogger.event("todo.plan.ready", {
        todoCount: plannedTodos.length,
        todoIds: plannedTodos.map((todo) => todo.id),
        todoTitles: plannedTodos.map((todo) => todo.title)
      });

      if (plannedTodos.length > 0) {
        runLogger.event("agent.execution.mode", {
          mode: "todo-plan",
          todoCount: plannedTodos.length
        });
        await toolRunner.run("write_todos", { todos: plannedTodos }, { traceParentId: runtimeTraceNodeId });
        const finalTodos = await this.executeTodoPlan({
          prompt: input.prompt,
          loadedSkill,
          todos: plannedTodos,
          registry,
          toolRunner,
          eventBus,
          contextManager,
          llmProvider,
          trace: input.trace,
          parentTraceId: runtimeTraceNodeId
        });
        const reply = await this.createFinalReply(input.prompt, loadedSkill, finalTodos, contextManager, llmProvider, runLogger, input.trace, runtimeTraceNodeId);
        emitFinalEvents(eventBus, reply);
        await input.trace?.endNode(runtimeTraceNodeId, {
          status: "success",
          summary: "Agent runtime completed with a todo plan.",
          output: {
            mode: "todo-plan",
            todos: finalTodos,
            reply
          }
        });
        runSpan.end({
          mode: "todo-plan",
          todoCount: finalTodos.length,
          replyChars: reply.length
        });
        return { reply };
      }

      runLogger.event("agent.execution.mode", {
        mode: "direct"
      });
      const directResult = await runAgentLoop({
        name: "Direct executor",
        llmProvider,
        toolRunner,
        eventBus,
        trace: input.trace,
        parentTraceId: runtimeTraceNodeId,
        allowedTools: executionToolNames,
        requireFinalContent: true,
        llmMessages: [
          { role: "system", content: buildExecutionSystemPrompt(loadedSkill) },
          { role: "user", content: input.prompt }
        ],
        toolRegistry: registry
      });
      const reply = directResult.content || "任务已完成。";

      emitFinalEvents(eventBus, reply);
      await input.trace?.endNode(runtimeTraceNodeId, {
        status: "success",
        summary: "Agent runtime completed directly.",
        output: {
          mode: "direct",
          reply,
          messages: directResult.messages
        }
      });
      runSpan.end({
        mode: "direct",
        replyChars: reply.length
      });
      return { reply };
    } catch (error) {
      await input.trace?.endNode(runtimeTraceNodeId, {
        status: "error",
        summary: error instanceof Error ? error.message : "Agent runtime failed.",
        error
      });
      runSpan.fail(error);
      throw error;
    }
  }

  private async askModelForTodoPlan(
    prompt: string,
    loadedSkill: LoadedSkill | undefined,
    registry: ToolRegistry,
    toolRunner: ToolRunner,
    eventBus: AgentEventBus,
    llmProvider: NonNullable<AgentRunInput["llmProvider"]>,
    trace: AgentRunInput["trace"],
    parentTraceId: string | undefined
  ) {
    eventBus.runLogger.event("todo.planning.start", {
      hasSkill: Boolean(loadedSkill),
      allowedTools: ["write_todos"]
    });
    await runAgentLoop({
      name: "Planner",
      llmProvider,
      toolRegistry: registry,
      toolRunner,
      eventBus,
      trace,
      parentTraceId,
      allowedTools: ["write_todos"],
      maxIterations: 6,
      llmMessages: [
        { role: "system", content: buildPlanningSystemPrompt(loadedSkill) },
        { role: "user", content: prompt }
      ]
    });
    eventBus.runLogger.event("todo.planning.end", {
      hasSkill: Boolean(loadedSkill)
    });
  }

  private async executeTodoPlan(options: {
    prompt: string;
    loadedSkill?: LoadedSkill;
    todos: Todo[];
    registry: ToolRegistry;
    toolRunner: ToolRunner;
    eventBus: AgentEventBus;
    contextManager: ContextManager;
    llmProvider: NonNullable<AgentRunInput["llmProvider"]>;
    trace: AgentRunInput["trace"];
    parentTraceId?: string;
  }): Promise<Todo[]> {
    let todos = options.todos;
    const runLogger = options.eventBus.runLogger;

    runLogger.event("todo.execution.start", {
      todoCount: todos.length,
      todoIds: todos.map((todo) => todo.id)
    });

    for (const [index, todo] of todos.entries()) {
      const todoTraceNodeId = await options.trace?.startNode({
        parentId: options.parentTraceId ?? options.trace.rootNodeId,
        type: "todo",
        title: todo.title,
        summary: todo.detail,
        input: {
          userRequest: options.prompt,
          todo,
          index: index + 1,
          total: todos.length,
          sharedSummary: options.contextManager.getSharedSummary()
        },
        metadata: {
          todoId: todo.id,
          todoIndex: index + 1,
          todoCount: todos.length
        }
      });
      runLogger.event("todo.execute.start", {
        todoId: todo.id,
        todoTitle: todo.title,
        todoIndex: index + 1,
        todoCount: todos.length,
        sharedSummaryChars: options.contextManager.getSharedSummary().length
      });
      todos = withTodoStatus(todos, todo.id, "in_progress");
      await options.toolRunner.run("write_todos", { todos }, { traceParentId: todoTraceNodeId });

      try {
        const result = await runAgentLoop({
          name: `Todo ${todo.id}`,
          llmProvider: options.llmProvider,
          toolRegistry: options.registry,
          toolRunner: options.toolRunner,
          eventBus: options.eventBus,
          trace: options.trace,
          parentTraceId: todoTraceNodeId,
          allowedTools: executionToolNames,
          requireFinalContent: true,
          allowSyntheticFinalContent: true,
          llmMessages: [
            { role: "system", content: buildTodoSystemPrompt(options.loadedSkill, options.contextManager.getSharedSummary()) },
            {
              role: "user",
              content: JSON.stringify({
                userRequest: options.prompt,
                todo: {
                  id: todo.id,
                  title: todo.title,
                  detail: todo.detail
                }
              })
            }
          ]
        });

        options.contextManager.commitTodo({
          todoId: todo.id,
          summary: result.content || `${todo.title} 已完成。`
        });
        runLogger.event("todo.execute.end", {
          todoId: todo.id,
          todoTitle: todo.title,
          resultChars: result.content.length,
          commitCount: options.contextManager.getCommits().length
        });
        todos = withTodoStatus(todos, todo.id, "completed");
        await options.toolRunner.run("write_todos", { todos }, { traceParentId: todoTraceNodeId });
        await options.trace?.endNode(todoTraceNodeId, {
          status: "success",
          summary: result.content || `${todo.title} completed.`,
          output: {
            todo: todos.find((item) => item.id === todo.id),
            result,
            commits: options.contextManager.getCommits()
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Todo execution failed.";
        runLogger.event(
          "todo.execute.fail",
          {
            todoId: todo.id,
            todoTitle: todo.title,
            error: message
          },
          "error"
        );
        todos = withTodoStatus(todos, todo.id, "failed", message);
        await options.toolRunner.run("write_todos", { todos }, { traceParentId: todoTraceNodeId });
        await options.trace?.endNode(todoTraceNodeId, {
          status: "error",
          summary: message,
          error,
          output: {
            todo: todos.find((item) => item.id === todo.id)
          }
        });
        throw error;
      }
    }

    runLogger.event("todo.execution.end", {
      todoCount: todos.length,
      completedCount: todos.filter((todo) => todo.status === "completed").length,
      failedCount: todos.filter((todo) => todo.status === "failed").length
    });

    return todos;
  }

  private async createFinalReply(
    prompt: string,
    loadedSkill: LoadedSkill | undefined,
    todos: Todo[],
    contextManager: ContextManager,
    llmProvider: NonNullable<AgentRunInput["llmProvider"]>,
    runLogger: NonNullable<AgentRunInput["runLogger"]>,
    trace: AgentRunInput["trace"],
    parentTraceId: string | undefined
  ): Promise<string> {
    runLogger.event("final_reply.start", {
      todoCount: todos.length,
      commitCount: contextManager.getCommits().length,
      hasSkill: Boolean(loadedSkill)
    });
    const response = await completeWithLogging({
      provider: llmProvider,
      runLogger,
      trace,
      traceParentId: parentTraceId,
      phase: "final-reply",
      request: {
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: buildFinalReplySystemPrompt(loadedSkill?.content)
          },
          {
            role: "user",
            content: JSON.stringify({
              userRequest: prompt,
              todos,
              todoCommits: contextManager.getCommits()
            })
          }
        ]
      }
    });

    const reply = response.content.trim() || "任务已完成。";
    runLogger.event("final_reply.end", {
      replyChars: reply.length,
      finishReason: response.finishReason
    });

    return reply;
  }
}

function buildPlanningSystemPrompt(loadedSkill: LoadedSkill | undefined): string {
  return buildAgentPlanningSystemPrompt(loadedSkill?.content);
}

function buildExecutionSystemPrompt(loadedSkill: LoadedSkill | undefined): string {
  return buildDirectExecutionSystemPrompt(loadedSkill?.content);
}

function buildTodoSystemPrompt(loadedSkill: LoadedSkill | undefined, sharedSummary: string): string {
  return buildTodoExecutionSystemPrompt(loadedSkill?.content, sharedSummary);
}

function normalizeTodoPlan(todos: Todo[]): Todo[] {
  return todos.map((todo) => ({
    ...todo,
    status: "pending"
  }));
}

function withTodoStatus(todos: Todo[], todoId: string, status: Todo["status"], detail?: string): Todo[] {
  return todos.map((todo) => (todo.id === todoId ? { ...todo, status, detail: detail ?? todo.detail } : todo));
}

function emitFinalEvents(eventBus: AgentEventBus, reply: string) {
  eventBus.emit({
    type: "summary.created",
    title: "执行完成",
    detail: compact(reply, 240),
    status: "done",
    flowKind: "summary",
    visibility: "primary"
  });

  eventBus.emit({
    type: "message.created",
    title: "生成助手回复",
    detail: "回复已写入当前会话。",
    status: "done",
    flowKind: "assistant_message",
    visibility: "secondary"
  });
}

function compact(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
