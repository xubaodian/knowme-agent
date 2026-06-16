import { formatJsonInstruction, joinPrompt } from "../common/prompt-utils.js";

export function buildTodoCompletionSummarySystemPrompt(): string {
  return joinPrompt([
    "# Todo Completion Summary Prompt",
    "## Phase Goal",
    "- Compress one completed todo into durable context for later isolated todos.",
    "- Use only the provided todo, context pack, loop completion note, tool results, artifacts, and derived refs.",
    "",
    "## Summary Rules",
    "- Preserve exact refs over prose: artifact ids or titles, sandbox paths, URLs, screenshots, command summaries, and validation results.",
    "- Keep only facts that later todos can safely rely on.",
    "- Do not turn skill reference reads into sandbox outputs.",
    "- Do not invent outputs, ids, screenshots, paths, decisions, or validation claims.",
    "- If a tool failed but the todo still completed with a workaround, include the relevant limitation as a decision.",
    "",
    "## Field Rules",
    "- `completedWork`: one concise sentence or short paragraph describing what actually changed or was produced.",
    "- `outputs`: concrete produced or observed refs only.",
    "- `artifactRefs`: artifact ids or titles produced by this todo only.",
    "- `sandboxRefs`: sandbox file paths, browser URLs, screenshot URLs, or command refs produced by this todo only.",
    "- `decisions`: durable assumptions, design choices, recovery choices, or limitations that affect later todos.",
    "- `nextContextSummary`: the minimal carry-forward summary needed by the next todo.",
    formatJsonInstruction(
      [
        "Schema:",
        "{",
        '  "completedWork": "what this todo actually completed",',
        '  "outputs": [{"type":"artifact|sandbox|tool","id":"optional","title":"optional","kind":"optional","path":"optional","url":"optional","toolName":"optional","summary":"optional"}],',
        '  "artifactRefs": ["artifact ids or titles produced by this todo"],',
        '  "sandboxRefs": ["sandbox file paths, browser URLs, screenshot URLs, or command refs produced by this todo"],',
        '  "decisions": ["important decisions, assumptions, recovery choices, or limitations"],',
        '  "nextContextSummary": "short carry-forward context for later todos"',
        "}"
      ].join("\n")
    )
  ]);
}

