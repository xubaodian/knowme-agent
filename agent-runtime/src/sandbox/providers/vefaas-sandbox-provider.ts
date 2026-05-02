import type { SandboxCallInput, SandboxExecutionResult } from "../../runtime/types.ts";
import { RemoteSandboxProvider } from "./remote-sandbox-provider.ts";

export interface VefaasSandboxClient {
  execute(input: SandboxCallInput): Promise<SandboxExecutionResult>;
}

export function createVefaasSandboxProvider(
  capabilityPrefix: string,
  client: VefaasSandboxClient
): RemoteSandboxProvider {
  return new RemoteSandboxProvider({
    name: "vefaas",
    capabilityPrefix,
    executor: {
      execute(input) {
        return client.execute(input);
      }
    }
  });
}
