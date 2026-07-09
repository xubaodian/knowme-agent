import { ArtifactManager } from "../artifacts/artifact-manager.js";
import { ContextManager } from "../context/context-manager.js";
import { createRunLogger, getLogger } from "../../logging/index.js";
import { createLlmProviderFromEnv } from "../llm/provider-factory.js";
import { SkillRegistry } from "../skills/skill-registry.js";
import { TaskStateManager } from "../task/task-state-manager.js";
import { TodoManager } from "../todos/todo-manager.js";
import { createArtifactTools } from "../tools/artifact-tools.js";
import { createFinishTaskTools } from "../tools/finish-task-tool.js";
import { createRecordNoteTools } from "../tools/record-note-tool.js";
import { LocalSandboxAdapter } from "../tools/sandbox/local-sandbox-adapter.js";
import { createSandboxTools } from "../tools/sandbox/sandbox-tools.js";
import { createTodoTools } from "../tools/todo-tools.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { ToolRunner } from "../tools/tool-runner.js";
import type { AgentRunInput, AgentRunResult, ExecutionProfile } from "../types.js";
import { AgentEventBus } from "./event-bus.js";
import { ExecutionUnitRunner } from "./execution-unit-runner.js";
import { FinalizationRunner } from "./finalization-runner.js";
import { PlanningRunner } from "./planning-runner.js";

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
    const taskState = new TaskStateManager();
    const llmProvider = input.llmProvider ?? createLlmProviderFromEnv();
    const sandbox = new LocalSandboxAdapter(input.workspaceRoot);
    const registry = new ToolRegistry();
    const profile = buildExecutionProfile(input.loadedSkill);
    const runtimeTraceNodeId = await input.trace?.startNode({
      parentId: input.trace.rootNodeId,
      type: "phase",
      title: "Agent runtime",
      summary: "Prepare provider, profile, tools, planning, execution units, and finalization.",
      input: {
        prompt: input.prompt,
        run: input.run,
        profile: summarizeProfile(profile),
        workspaceRoot: input.workspaceRoot,
        skillsRoot: input.skillsRoot
      },
      metadata: {
        profileMode: profile.mode,
        skillName: profile.mode === "skill" ? profile.skillName : undefined,
        workspaceRoot: input.workspaceRoot,
        skillsRoot: input.skillsRoot
      }
    });

    registry.registerMany([
      ...createTodoTools(),
      ...createArtifactTools(),
      ...createFinishTaskTools(),
      ...createRecordNoteTools(),
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
      loadedSkill: input.loadedSkill,
      artifactManager,
      contextManager,
      skillRegistry,
      sandbox,
      todoManager,
      taskState
    });

    eventBus.emit({
      type: "run.started",
      title: "Run started",
      detail: "Agent Runtime 已启动，正在准备 LLM、Skill 和工具执行环境。",
      status: "running",
      flowKind: "status",
      visibility: "debug"
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
      visibility: llmStatus.configured ? "debug" : "primary"
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
      runLogger.event("profile.ready", summarizeProfile(profile));
      eventBus.emit({
        type: "thought.created",
        title: profile.mode === "skill" ? "Skill ready" : "Generic profile ready",
        detail: profile.mode === "skill" ? `已选择 skill：${profile.skillName}` : "未选择 skill，使用通用执行 profile。",
        status: "done",
        flowKind: "thought",
        visibility: "debug"
      });

      runLogger.event("agent.execution.mode", {
        mode: "three-phase-runtime",
        profile: summarizeProfile(profile)
      });
      const plan = await new PlanningRunner({
        prompt: input.prompt,
        profile,
        registry,
        toolRunner,
        eventBus,
        todoManager,
        llmProvider,
        trace: input.trace,
        parentTraceId: runtimeTraceNodeId
      }).run();
      const todos = await new ExecutionUnitRunner({
        prompt: input.prompt,
        profile,
        registry,
        toolRunner,
        eventBus,
        contextManager,
        todoManager,
        artifactManager,
        llmProvider,
        trace: input.trace,
        parentTraceId: runtimeTraceNodeId
      }).runAll(plan.todos);
      const finished = await new FinalizationRunner({
        profile,
        goal: todoManager.getGoal(),
        todos,
        registry,
        toolRunner,
        eventBus,
        contextManager,
        artifactManager,
        taskState,
        llmProvider,
        trace: input.trace,
        parentTraceId: runtimeTraceNodeId
      }).run();
      const reply = finished.answer || "任务已完成。";

      emitFinalEvents(eventBus, reply);
      await input.trace?.endNode(runtimeTraceNodeId, {
        status: "success",
        summary: "Agent runtime completed.",
        output: {
          mode: "three-phase-runtime",
          plan: todoManager.getPlan(),
          completions: contextManager.getCompletions(),
          finished,
          reply
        }
      });
      runSpan.end({
        mode: "three-phase-runtime",
        todoCount: todos.length,
        completionCount: contextManager.getCompletions().length,
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
}

function buildExecutionProfile(loadedSkill: AgentRunInput["loadedSkill"]): ExecutionProfile {
  if (!loadedSkill) {
    return {
      mode: "generic",
      profileName: "general-agent"
    };
  }

  return {
    mode: "skill",
    skillName: loadedSkill.name,
    skillContent: loadedSkill.content,
    description: loadedSkill.description,
    path: loadedSkill.path
  };
}

function summarizeProfile(profile: ExecutionProfile) {
  return profile.mode === "skill"
    ? {
        mode: profile.mode,
        skillName: profile.skillName,
        description: profile.description,
        path: profile.path,
        contentChars: profile.skillContent.length
      }
    : profile;
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
