import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { JsonValue } from "../../shared.ts";
import type { SandboxCallInput, SandboxExecutionResult, SandboxProvider } from "../../runtime/types.ts";

export class FsSandboxProvider implements SandboxProvider {
  readonly name = "local";
  readonly capabilityPrefix = "fs.";

  async execute(input: SandboxCallInput): Promise<SandboxExecutionResult> {
    if (input.capability === "fs.read") {
      const path = input.input.path;
      if (typeof path !== "string") {
        throw new Error("fs.read requires a string path");
      }

      const output = await readFile(path, "utf8");
      return { output };
    }

    if (input.capability === "fs.write") {
      const path = input.input.path;
      const content = input.input.content;

      if (typeof path !== "string" || typeof content !== "string") {
        throw new Error("fs.write requires string path and content");
      }

      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
      return {
        output: {
          path,
          bytesWritten: Buffer.byteLength(content, "utf8")
        }
      };
    }

    return {
      output: `Unsupported fs capability: ${input.capability}` satisfies JsonValue
    };
  }
}
