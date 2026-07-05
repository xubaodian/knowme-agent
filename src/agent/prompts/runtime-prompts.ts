import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ContextPack, ExecutionProfile, Todo } from "../types.js";
import { joinPrompt } from "./common/prompt-utils.js";

type PromptName = "common" | "planning" | "execution" | "finalization";

const promptCache = new Map<PromptName, string>();

export async function buildPlanningPrompt(input: {
  profile: ExecutionProfile;
}): Promise<string> {
  return joinPrompt([
    await readPrompt("common"),
    await readPrompt("planning"),
    formatExecutionProfile(input.profile)
  ]);
}

export async function buildExecutionPrompt(input: {
  contextPack: ContextPack;
}): Promise<string> {
  return joinPrompt([
    await readPrompt("common"),
    await readPrompt("execution"),
    "## Current Execution Context",
    JSON.stringify(input.contextPack, null, 2)
  ]);
}

export async function buildFinalizationPrompt(input: {
  profile: ExecutionProfile;
  goal: string;
  todos: Todo[];
  artifacts: unknown[];
  carryForwardSummary: string;
}): Promise<string> {
  return joinPrompt([
    await readPrompt("common"),
    await readPrompt("finalization"),
    formatExecutionProfile(input.profile),
    "## Finalization Context",
    JSON.stringify(
      {
        goal: input.goal,
        todos: input.todos,
        artifacts: input.artifacts,
        carryForwardSummary: input.carryForwardSummary
      },
      null,
      2
    )
  ]);
}

export function formatExecutionProfile(profile: ExecutionProfile): string {
  if (profile.mode === "skill") {
    return joinPrompt([
      "## Execution Profile",
      `Mode: skill`,
      `Skill: ${profile.skillName}`,
      profile.description ? `Description: ${profile.description}` : undefined,
      "## Skill Instructions",
      profile.skillContent
    ]);
  }

  return [
    "## Execution Profile",
    "Mode: generic",
    `Profile: ${profile.profileName}`,
    "Use the common runtime principles to plan and execute a concrete, tool-backed task."
  ].join("\n");
}

async function readPrompt(name: PromptName): Promise<string> {
  const cached = promptCache.get(name);

  if (cached) {
    return cached;
  }

  const content = await readFile(path.join(process.cwd(), "agent", "prompts", `${name}.md`), "utf8");
  promptCache.set(name, content.trim());
  return content.trim();
}
