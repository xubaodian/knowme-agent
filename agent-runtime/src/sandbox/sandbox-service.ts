import type { SandboxCall } from "../shared.ts";
import type {
  SandboxActionAdapter,
  SandboxCallInput,
  SandboxProvider,
  SandboxService,
  SandboxTargetResolver,
  ToolExecutionRequest
} from "../runtime/types.ts";

function mapProviderName(prefix: string): SandboxCall["provider"] {
  switch (prefix) {
    case "fs.":
      return "fs";
    case "exec.":
      return "exec";
    case "browser.":
      return "browser";
    case "artifact.":
      return "artifact";
    case "code.":
      return "codeInterpreter";
    default:
      return "exec";
  }
}

export class DefaultSandboxService implements SandboxService {
  private readonly providers: SandboxProvider[];
  private readonly actionAdapters: SandboxActionAdapter[];
  private readonly targetResolver: SandboxTargetResolver | undefined;

  constructor(input: {
    providers: SandboxProvider[];
    actionAdapters: SandboxActionAdapter[];
    targetResolver?: SandboxTargetResolver;
  }) {
    this.providers = input.providers;
    this.actionAdapters = input.actionAdapters;
    this.targetResolver = input.targetResolver;
  }

  listCapabilities(): string[] {
    return this.providers.map((provider) => `${provider.name}:${provider.capabilityPrefix}`);
  }

  async executeTool(
    request: ToolExecutionRequest
  ): Promise<{ call: SandboxCall; result: import("../runtime/types.ts").SandboxExecutionResult }> {
    const adapter = this.actionAdapters.find((candidate) => candidate.tool === request.tool);
    if (!adapter) {
      throw new Error(`No sandbox action adapter registered for tool "${request.tool}"`);
    }

    const callInput = adapter.toSandboxCallInput(request);
    const target = this.targetResolver?.resolve(request.request);
    return this.call({
      ...callInput,
      ...(target ? { target } : {})
    });
  }

  async call(input: SandboxCallInput): Promise<{ call: SandboxCall; result: import("../runtime/types.ts").SandboxExecutionResult }> {
    const matchingProviders = this.providers.filter((candidate) =>
      input.capability.startsWith(candidate.capabilityPrefix)
    );
    const provider = input.target?.provider
      ? matchingProviders.find((candidate) => candidate.name === input.target?.provider)
      : matchingProviders[0];
    if (!provider) {
      throw new Error(`No sandbox provider found for capability "${input.capability}"`);
    }

    const startedAt = new Date().toISOString();
    const result = await provider.execute(input);
    const endedAt = new Date().toISOString();

    return {
      call: {
        callId: `call_${input.stepId}`,
        taskId: input.request.requestId,
        skillId: input.skillId,
        stepId: input.stepId,
        provider: mapProviderName(provider.capabilityPrefix),
        capability: input.capability,
        action: input.action,
        input: input.input,
        ...(result.output !== undefined ? { output: result.output } : {}),
        status: "completed",
        startedAt,
        endedAt
      },
      result
    };
  }
}
