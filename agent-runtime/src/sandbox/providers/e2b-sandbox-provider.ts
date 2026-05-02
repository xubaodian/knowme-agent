import type { SandboxCallInput, SandboxExecutionResult } from "../../runtime/types.ts";
import { RemoteSandboxProvider } from "./remote-sandbox-provider.ts";

export interface E2BSandboxClient {
  execute(input: SandboxCallInput): Promise<SandboxExecutionResult>;
}

export function createE2BSandboxProvider(
  capabilityPrefix: string,
  client: E2BSandboxClient
): RemoteSandboxProvider {
  return new RemoteSandboxProvider({
    name: "e2b",
    capabilityPrefix,
    executor: {
      execute(input) {
        return client.execute(input);
      }
    }
  });
}
