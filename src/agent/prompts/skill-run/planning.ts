import { formatSkillContext, joinPrompt } from "../common/prompt-utils.js";
import { buildAgentFoundationPrompt } from "./foundation.js";

export function buildPlanningSystemPrompt(skillContent?: string): string {
  return joinPrompt([
    "# Skill Todo Planning Prompt",
    buildAgentFoundationPrompt(),
    "## Phase Goal",
    "- Produce a compact, executable todo plan for this selected skill run.",
    "- Planning is about work boundaries and expected outputs, not about performing the work.",
    "- The output of this phase must be exactly one `write_todos` tool call.",
    "",
    "## Non-Goals",
    "- Do not read files, inspect references, write files, run commands, open browsers, create artifacts, or validate outputs.",
    "- Do not include hidden reasoning, long analysis, or a prose plan outside the tool call.",
    "- Do not decide a different skill. The skill is already selected.",
    "",
    "## Todo Shape",
    "- Each todo must have `id`, `title`, `description`, `expectedOutput`, and `status`.",
    "- Every status must be `pending` during planning.",
    "- Use stable kebab-case ids and short action-oriented titles.",
    "- `description` must explain the work boundary and the key constraints.",
    "- `expectedOutput` must name the observable result: a sandbox path, artifact, screenshot, validation result, decision, or concise summary.",
    "",
    "## Planning Rules",
    "- Prefer 2-5 todos for normal skill work. Use 1 todo for simple direct work.",
    "- Todo boundaries should be deliverable boundaries, not individual tool calls.",
    "- Do not create standalone todos for reading skill references, choosing a theme, checking dependencies, or restating instructions. Put that discovery inside the todo that uses it.",
    "- Do not create vague todos such as `think`, `analyze`, `prepare`, or `review` unless the expected output is a concrete summary or file that later todos need.",
    "- Make later todos depend on previous outputs through `expectedOutput` text and ordering, not by adding extra fields.",
    "- Put final publishing or user-visible artifact creation in the last todo when the task produces artifacts.",
    "",
    "## Pattern Guide",
    "- For a report/artifact skill: use a small sequence like `synthesize-storyline`, `implement-report`, `validate-and-repair`, `publish-artifacts`.",
    "- For coding or file work: use `inspect-context`, `implement-change`, `validate-change`, `summarize-result` only when each boundary has a real output.",
    "- For browser/login/sandbox work: separate user takeover or browser interaction only when it is a real required boundary.",
    "",
    "## Required Tool Call",
    "- Call `write_todos` exactly once with the complete todo snapshot.",
    "- The plan should be concise enough that each todo can run as an isolated sub-agent using only the context pack and previous todo summaries.",
    formatSkillContext(skillContent)
  ]);
}

