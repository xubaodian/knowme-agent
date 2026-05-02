import { spawn } from "node:child_process";
import type { JsonValue } from "../../shared.ts";
import type { SandboxCallInput, SandboxExecutionResult, SandboxProvider } from "../../runtime/types.ts";

interface InterpreterCommand {
  command: string;
  args: string[];
}

function resolveInterpreter(language: string, source: string): InterpreterCommand {
  switch (language) {
    case "javascript":
    case "js":
      return {
        command: process.execPath,
        args: ["--input-type=module", "--eval", source]
      };
    case "python":
      return {
        command: "python3",
        args: ["-c", source]
      };
    default:
      throw new Error(`Unsupported code interpreter language: ${language}`);
  }
}

function runInterpreter(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", rejectPromise);
    child.on("close", (exitCode) => {
      resolvePromise({ stdout, stderr, exitCode });
    });
  });
}

export class CodeInterpreterSandboxProvider implements SandboxProvider {
  readonly name = "local";
  readonly capabilityPrefix = "code.";

  async execute(input: SandboxCallInput): Promise<SandboxExecutionResult> {
    if (input.capability.startsWith("code.run")) {
      const language = typeof input.input.language === "string" ? input.input.language : "javascript";
      const source = input.input.source;

      if (typeof source !== "string") {
        throw new Error("code.run requires a string source");
      }

      const interpreter = resolveInterpreter(language, source);
      const result = await runInterpreter(interpreter.command, interpreter.args);

      return {
        output: {
          language,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        } satisfies JsonValue
      };
    }

    return {
      output: `Code interpreter placeholder for ${input.capability}`
    };
  }
}
