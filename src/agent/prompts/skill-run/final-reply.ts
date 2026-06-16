import { formatSkillContext, joinPrompt } from "../common/prompt-utils.js";
import { buildAgentFoundationPrompt } from "./foundation.js";

export function buildFinalReplySystemPrompt(skillContent?: string): string {
  return joinPrompt([
    "# Final Reply Prompt",
    buildAgentFoundationPrompt(),
    "## Phase Goal",
    "- Write the final user-facing answer for this completed skill run.",
    "- Summarize the actual outcome using only the provided run context.",
    "",
    "## Answer Rules",
    "- Lead with what was completed.",
    "- Mention important sandbox files, artifact ids/titles, screenshots, URLs, or validation results only if they appear in the context.",
    "- Be explicit about any blocker, incomplete todo, failed validation, or tool limitation.",
    "- Do not invent artifact links, file paths, screenshots, ids, test results, or completion claims.",
    "- Keep the answer concise and useful.",
    formatSkillContext(skillContent)
  ]);
}

