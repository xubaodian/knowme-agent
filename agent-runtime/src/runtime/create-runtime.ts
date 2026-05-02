import type { AgentRequest, SkillSpec } from "../shared.ts";
import { buildRuntimeContext } from "../core/context-builder.ts";
import { writeTaskSummary } from "../core/memory-updater.ts";
import { createTaskPlan } from "../core/planner.ts";
import { normalizeRequest } from "../core/request-normalizer.ts";
import { synthesizeResponse } from "../core/result-synthesizer.ts";
import { selectSkills } from "../core/skill-router.ts";
import { InMemoryMemoryStore } from "../memory/in-memory-memory-store.ts";
import type {
  LlmExecutor,
  MemoryStore,
  RequestHandlingResult,
  SkillRuntimeResult,
  SandboxService,
  SkillRegistry
} from "./types.ts";
import { FileSystemSkillRegistry } from "../skill-system/file-system-skill-registry.ts";
import { InMemorySkillRegistry } from "../skill-system/in-memory-skill-registry.ts";
import { MockLlmExecutor } from "../skill-runtime/llm/mock-llm-executor.ts";
import { executeSkill } from "../skill-runtime/skill-executor.ts";
import { createDefaultSandboxActionAdapters } from "../sandbox/action-adapters.ts";
import { DefaultSandboxService } from "../sandbox/sandbox-service.ts";
import { ArtifactSandboxProvider } from "../sandbox/providers/artifact-provider.ts";
import { BrowserSandboxProvider } from "../sandbox/providers/browser-provider.ts";
import { CodeInterpreterSandboxProvider } from "../sandbox/providers/code-interpreter-provider.ts";
import { ExecSandboxProvider } from "../sandbox/providers/exec-provider.ts";
import { FsSandboxProvider } from "../sandbox/providers/fs-provider.ts";
import { MetadataSandboxTargetResolver } from "../sandbox/target-resolver.ts";
import { createVefaasProviders, loadVefaasEnvConfig } from "../sandbox/vefaas-factory.ts";

const MAX_SKILL_HANDOFFS = 4;
const vefaasEnvConfig = loadVefaasEnvConfig();

export interface RuntimeDependencies {
  memoryStore: MemoryStore;
  skillRegistry: SkillRegistry;
  llmExecutor: LlmExecutor;
  sandbox: SandboxService;
}

interface DelegatePayload {
  goal: string;
  handoff_state?: unknown;
}

function isDelegatePayload(value: unknown): value is DelegatePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "goal" in value &&
    typeof (value as { goal?: unknown }).goal === "string"
  );
}

function buildDelegatedContext(
  context: RequestHandlingResult["context"],
  delegate: DelegatePayload
): RequestHandlingResult["context"] {
  const parts = [delegate.goal.trim()];
  if (delegate.handoff_state !== undefined) {
    parts.push(`Handoff state: ${JSON.stringify(delegate.handoff_state)}`);
  }
  const delegatedMessage = parts.join(" ");

  return {
    ...context,
    request: {
      ...context.request,
      message: delegatedMessage,
      normalizedMessage: delegatedMessage
    }
  };
}

export class KnowMeRuntime {
  private readonly dependencies: RuntimeDependencies;

  constructor(dependencies: RuntimeDependencies) {
    this.dependencies = dependencies;
  }

  async handleRequest(request: AgentRequest): Promise<RequestHandlingResult> {
    const normalized = normalizeRequest(request);
    const context = await buildRuntimeContext(
      normalized,
      this.dependencies.memoryStore,
      this.dependencies.skillRegistry
    );
    const plan = await createTaskPlan(context);
    const skillResults: SkillRuntimeResult[] = [];
    const selectedSkillIds: string[] = [];
    const executedSkillIds = new Set<string>();
    const initialSelection = await selectSkills(context);
    const queue: Array<{
      context: typeof context;
      selection: typeof initialSelection;
    }> = [{ context, selection: initialSelection }];
    let handoffCount = 0;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      for (const skillId of current.selection.selectedSkillIds) {
        if (executedSkillIds.has(skillId)) {
          continue;
        }

        executedSkillIds.add(skillId);
        selectedSkillIds.push(skillId);

        const skill = await this.dependencies.skillRegistry.loadSkill(skillId);
        const result = await executeSkill(
          skill,
          current.context,
          this.dependencies.llmExecutor,
          this.dependencies.sandbox
        );
        skillResults.push(result);

        const delegateOutput = result.execution.outputs.delegate;
        if (!isDelegatePayload(delegateOutput) || handoffCount >= MAX_SKILL_HANDOFFS) {
          continue;
        }

        handoffCount += 1;
        const delegatedContext = buildDelegatedContext(current.context, delegateOutput);
        const delegatedSelection = await selectSkills(delegatedContext, {
          excludeSkillIds: [...executedSkillIds],
          overrideMessage: delegatedContext.request.normalizedMessage
        });

        if (delegatedSelection.selectedSkillIds.length > 0) {
          queue.push({
            context: delegatedContext,
            selection: delegatedSelection
          });
        }
      }
    }

    const skillExecutions = skillResults.map((result) => result.execution);
    const sandboxCalls = skillResults.flatMap((result) => result.sandboxCalls);
    const artifacts = skillResults.flatMap((result) => result.artifacts);
    const selection = {
      ...(selectedSkillIds[0] ? { primarySkillId: selectedSkillIds[0] } : {}),
      selectedSkillIds,
      reason: initialSelection.reason
    };
    const summary = selection.primarySkillId
      ? `Completed request with skill ${selection.primarySkillId}.`
      : "Completed request without an explicit skill.";
    const memoryWrites = await writeTaskSummary(context, this.dependencies.memoryStore, summary);
    const response = synthesizeResponse({
      context,
      ...(plan ? { plan } : {}),
      selection,
      skillExecutions,
      sandboxCalls,
      artifacts,
      memoryWrites
    });

    return {
      context,
      ...(plan ? { plan } : {}),
      selection,
      skillResults,
      memoryWrites,
      response
    };
  }
}

export function createDefaultRuntime(skills: SkillSpec[] = []): KnowMeRuntime {
  const providers = [
    new FsSandboxProvider(),
    new ExecSandboxProvider(),
    new CodeInterpreterSandboxProvider(),
    new BrowserSandboxProvider(),
    new ArtifactSandboxProvider(),
    ...(vefaasEnvConfig ? createVefaasProviders() : [])
  ];

  return new KnowMeRuntime({
    memoryStore: new InMemoryMemoryStore([
      {
        id: "mem_profile_001",
        scope: "profile",
        type: "preference",
        userId: "user_001",
        content: "Prefer concise output.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]),
    skillRegistry: new InMemorySkillRegistry(skills),
    llmExecutor: new MockLlmExecutor(),
    sandbox: new DefaultSandboxService({
      providers,
      actionAdapters: createDefaultSandboxActionAdapters(),
      targetResolver: new MetadataSandboxTargetResolver()
    })
  });
}

export function createDefaultRuntimeFromSkillDirectory(skillDirectory: string): KnowMeRuntime {
  const providers = [
    new FsSandboxProvider(),
    new ExecSandboxProvider(),
    new CodeInterpreterSandboxProvider(),
    new BrowserSandboxProvider(),
    new ArtifactSandboxProvider(),
    ...(vefaasEnvConfig ? createVefaasProviders() : [])
  ];

  return new KnowMeRuntime({
    memoryStore: new InMemoryMemoryStore([
      {
        id: "mem_profile_001",
        scope: "profile",
        type: "preference",
        userId: "user_001",
        content: "Prefer concise output.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]),
    skillRegistry: new FileSystemSkillRegistry(skillDirectory),
    llmExecutor: new MockLlmExecutor(),
    sandbox: new DefaultSandboxService({
      providers,
      actionAdapters: createDefaultSandboxActionAdapters(),
      targetResolver: new MetadataSandboxTargetResolver()
    })
  });
}
