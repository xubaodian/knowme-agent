import { ArtifactManager } from "../artifacts/artifact-manager.js";
import { ContextManager } from "../context/context-manager.js";
import { createRunLogger, getLogger } from "../../logging/index.js";
import { createLlmProviderFromEnv } from "../llm/provider-factory.js";
import { SkillRegistry } from "../skills/skill-registry.js";
import { TodoManager } from "../todos/todo-manager.js";
import { createArtifactTools } from "../tools/artifact-tools.js";
import { createSkillTools } from "../tools/skill-tools.js";
import { LocalSandboxAdapter } from "../tools/sandbox/local-sandbox-adapter.js";
import { createSandboxTools } from "../tools/sandbox/sandbox-tools.js";
import { createTodoTools } from "../tools/todo-tools.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { ToolRunner } from "../tools/tool-runner.js";
import type { AgentRunInput, AgentRunResult } from "../types.js";
import { AgentEventBus } from "./event-bus.js";
import { SkillRunEngine } from "./skill-run-engine.js";

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
        loadedSkill: {
          name: input.loadedSkill.name,
          description: input.loadedSkill.description,
          path: input.loadedSkill.path
        },
        workspaceRoot: input.workspaceRoot,
        skillsRoot: input.skillsRoot
      },
      metadata: {
        skillName: input.loadedSkill.name,
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
      loadedSkill: input.loadedSkill,
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
      runLogger.event("skill.loaded", {
        skillName: input.loadedSkill.name,
        directory: input.loadedSkill.directory,
        contentChars: input.loadedSkill.content.length
      });
      eventBus.emit({
        type: "thought.created",
        title: "Skill ready",
        detail: `已选择 skill：${input.loadedSkill.name}`,
        status: "done",
        flowKind: "thought",
        visibility: "secondary"
      });

      runLogger.event("agent.execution.mode", {
        mode: "skill-run-engine",
        skillName: input.loadedSkill.name
      });
      const skillRunResult = await new SkillRunEngine({
        prompt: input.prompt,
        loadedSkill: input.loadedSkill,
        registry,
        toolRunner,
        eventBus,
        contextManager,
        todoManager,
        artifactManager,
        llmProvider,
        trace: input.trace,
        parentTraceId: runtimeTraceNodeId
      }).run();
      const reply = skillRunResult.reply || "任务已完成。";

      emitFinalEvents(eventBus, reply);
      await input.trace?.endNode(runtimeTraceNodeId, {
        status: "success",
        summary: "Agent runtime completed.",
        output: {
          mode: "skill-run-engine",
          todos: skillRunResult.todos,
          completions: skillRunResult.completions,
          reply
        }
      });
      runSpan.end({
        mode: "skill-run-engine",
        todoCount: skillRunResult.todos.length,
        completionCount: skillRunResult.completions.length,
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
