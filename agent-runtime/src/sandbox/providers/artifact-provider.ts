import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Artifact } from "../../shared.ts";
import type { SandboxCallInput, SandboxExecutionResult, SandboxProvider } from "../../runtime/types.ts";

export class ArtifactSandboxProvider implements SandboxProvider {
  readonly name = "local";
  readonly capabilityPrefix = "artifact.";

  async execute(input: SandboxCallInput): Promise<SandboxExecutionResult> {
    const requestedPath = input.input.path;
    const content = input.input.content;

    if (typeof requestedPath !== "string" || typeof content !== "string") {
      throw new Error("artifact.write requires string path and content");
    }

    const fullPath = resolve(requestedPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf8");

    const artifact: Artifact = {
      id: `artifact_${input.stepId}`,
      type: "text",
      name: fullPath.split("/").pop() ?? "artifact.txt",
      path: fullPath,
      producer: input.skillId
    };

    return {
      output: fullPath,
      artifact
    };
  }
}
