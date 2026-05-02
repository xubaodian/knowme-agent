import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentRequest,
  AgentResponse,
  DashboardSnapshot,
  RunTaskPayload,
  SkillRegistryEntry
} from "../shared.ts";
import { InMemoryMemoryStore } from "../memory/in-memory-memory-store.ts";
import { MockLlmExecutor } from "../skill-runtime/llm/mock-llm-executor.ts";
import { OpenRouterLlmExecutor } from "../skill-runtime/llm/openrouter-llm-executor.ts";
import { createDefaultSandboxActionAdapters } from "../sandbox/action-adapters.ts";
import { DefaultSandboxService } from "../sandbox/sandbox-service.ts";
import { ArtifactSandboxProvider } from "../sandbox/providers/artifact-provider.ts";
import { BrowserSandboxProvider } from "../sandbox/providers/browser-provider.ts";
import { CodeInterpreterSandboxProvider } from "../sandbox/providers/code-interpreter-provider.ts";
import { ExecSandboxProvider } from "../sandbox/providers/exec-provider.ts";
import { FsSandboxProvider } from "../sandbox/providers/fs-provider.ts";
import { MetadataSandboxTargetResolver } from "../sandbox/target-resolver.ts";
import { createVefaasProviders, loadVefaasEnvConfig } from "../sandbox/vefaas-factory.ts";
import { FileSystemSkillRegistry } from "../skill-system/file-system-skill-registry.ts";
import { KnowMeRuntime } from "./create-runtime.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(__dirname, "..", "..", "..");
const skillDirectory = join(workspaceRoot, "skills");
const skillStateFile = join(workspaceRoot, "examples", ".skill-registry-state.json");
const vefaasEnvConfig = loadVefaasEnvConfig();

export class DemoRuntimeService {
  private readonly memoryStore: InMemoryMemoryStore;
  private readonly skillRegistry: FileSystemSkillRegistry;
  private readonly runtime: KnowMeRuntime;
  private latestResponse: AgentResponse | undefined;

  constructor() {
    this.memoryStore = new InMemoryMemoryStore([
      {
        id: "mem_profile_001",
        scope: "profile",
        type: "preference",
        userId: "user_001",
        content: "Prefer concise output.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);

    this.skillRegistry = new FileSystemSkillRegistry(skillDirectory, skillStateFile);
    const providers = [
      new FsSandboxProvider(),
      new ExecSandboxProvider(),
      new CodeInterpreterSandboxProvider(),
      new BrowserSandboxProvider(),
      new ArtifactSandboxProvider(),
      ...(vefaasEnvConfig ? createVefaasProviders() : [])
    ];
    this.runtime = new KnowMeRuntime({
      memoryStore: this.memoryStore,
      skillRegistry: this.skillRegistry,
      llmExecutor: createLlmExecutor(),
      sandbox: new DefaultSandboxService({
        providers,
        actionAdapters: createDefaultSandboxActionAdapters(),
        targetResolver: new MetadataSandboxTargetResolver()
      })
    });
  }

  async getSnapshot(): Promise<DashboardSnapshot> {
    const [entries, profileMemory, sessionMemory] = await Promise.all([
      this.skillRegistry.listEntries?.() ?? Promise.resolve([]),
      this.memoryStore.listProfileMemory("user_001"),
      this.memoryStore.listSessionMemory("session_demo_live")
    ]);

    const latestPlan = this.latestResponse?.plan?.steps.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      state: step.status
    })) ?? [];

    const latestTraces = this.latestResponse?.sandboxCalls.map((call) => ({
      provider: call.provider,
      capability: call.capability,
      status: call.status,
      detail: `${call.action} completed for ${call.capability}`
    })) ?? [];

    const latestArtifacts = this.latestResponse?.artifacts.map((artifact) => ({
      name: artifact.name,
      type: artifact.type,
      location: artifact.path
    })) ?? [];

    const selectedSkills = this.latestResponse?.selectedSkillIds ?? [];
    const currentInput = this.latestResponse
      ? "Latest request executed through the live workspace route."
      : "希望支持 community skills，并把 browser、files、code 都通过 sandbox 统一执行。";

    return {
      agentName: "KnowMe Agent",
      persona: "Personal-theme manager agent with sandbox-first execution",
      profile: {
        tone: "Concise, structured, warm",
        defaultLanguage: "Chinese",
        planningMode: "Lightweight planner on complex tasks"
      },
      currentTask: {
        title: "Live workspace request",
        input: currentInput,
        attachments: [],
        status: this.latestResponse ? "Completed" : "Idle",
        selectedSkills
      },
      plan: latestPlan,
      traces: latestTraces,
      artifacts: latestArtifacts,
      memory: [...profileMemory, ...sessionMemory].map((record) => ({
        scope: record.scope,
        content: record.content
      })),
      skills: mapSkillItems(entries),
      ...(this.latestResponse ? { latestResponse: this.latestResponse } : {})
    };
  }

  async runTask(payload: RunTaskPayload): Promise<AgentResponse> {
    const request: AgentRequest = {
      requestId: `req_${randomUUID()}`,
      userId: "user_001",
      sessionId: "session_demo_live",
      message: payload.message,
      attachments: []
    };

    const result = await this.runtime.handleRequest(request);
    this.latestResponse = result.response;
    return result.response;
  }

  async setSkillEnabled(skillId: string, enabled: boolean): Promise<DashboardSnapshot> {
    await this.skillRegistry.setEnabled?.(skillId, enabled);
    return this.getSnapshot();
  }
}

function mapSkillItems(entries: SkillRegistryEntry[]): DashboardSnapshot["skills"] {
  return entries.map((entry) => ({
    id: entry.skillId,
    name: entry.name,
    source: entry.source,
    enabled: entry.enabled
  }));
}

declare global {
  // eslint-disable-next-line no-var
  var __knowMeDemoRuntimeService: DemoRuntimeService | undefined;
}

export function getDemoRuntimeService(): DemoRuntimeService {
  if (!globalThis.__knowMeDemoRuntimeService) {
    globalThis.__knowMeDemoRuntimeService = new DemoRuntimeService();
  }

  return globalThis.__knowMeDemoRuntimeService;
}

function createLlmExecutor() {
  if (process.env.OPENROUTER_API_KEY) {
    return new OpenRouterLlmExecutor();
  }

  return new MockLlmExecutor();
}
