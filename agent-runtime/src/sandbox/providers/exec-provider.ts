import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { JsonValue } from "../../shared.ts";
import type { SandboxCallInput, SandboxExecutionResult, SandboxProvider } from "../../runtime/types.ts";

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function runCommand(input: {
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
}): Promise<CommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      rejectPromise(error);
    });

    child.on("close", (exitCode) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolvePromise({ stdout, stderr, exitCode });
    });

    if (input.timeoutMs && input.timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
        rejectPromise(new Error(`Command timed out after ${input.timeoutMs}ms`));
      }, input.timeoutMs);
    }
  });
}

export class ExecSandboxProvider implements SandboxProvider {
  readonly name = "local";
  readonly capabilityPrefix = "exec.";

  async execute(input: SandboxCallInput): Promise<SandboxExecutionResult> {
    if (input.capability === "exec.run" || input.capability === "exec.shell") {
      const command = input.input.command;
      const args = input.input.args;
      const cwd = input.input.cwd;
      const timeoutMs = input.input.timeoutMs;

      if (typeof command !== "string") {
        throw new Error("exec.run requires a string command");
      }

      const result = await runCommand({
        command,
        args: Array.isArray(args) ? args.map(String) : [],
        cwd: typeof cwd === "string" ? resolve(cwd) : process.cwd(),
        timeoutMs: typeof timeoutMs === "number" ? timeoutMs : 5000
      });

      return {
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        } satisfies JsonValue
      };
    }

    return {
      output: `Exec provider placeholder for ${input.capability}`
    };
  }
}
