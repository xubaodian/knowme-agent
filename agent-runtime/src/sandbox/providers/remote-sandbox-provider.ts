import type { SandboxCallInput, SandboxExecutionResult, SandboxProvider } from "../../runtime/types.ts";

export interface RemoteSandboxExecutor {
  execute(input: SandboxCallInput): Promise<SandboxExecutionResult>;
}

export class RemoteSandboxProvider implements SandboxProvider {
  readonly name: string;
  readonly capabilityPrefix: string;
  private readonly executor: RemoteSandboxExecutor;

  constructor(input: {
    name: string;
    capabilityPrefix: string;
    executor: RemoteSandboxExecutor;
  }) {
    this.name = input.name;
    this.capabilityPrefix = input.capabilityPrefix;
    this.executor = input.executor;
  }

  async execute(input: SandboxCallInput): Promise<SandboxExecutionResult> {
    return this.executor.execute(input);
  }
}
