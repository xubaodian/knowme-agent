export function joinPrompt(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join("\n\n");
}

export function formatSkillContext(skillContent: string | undefined): string {
  return skillContent ? `## Selected Skill Instructions\n${skillContent}` : "## Selected Skill Instructions\nNo skill instructions are loaded.";
}

export function formatJsonInstruction(schemaDescription: string): string {
  return [
    "Return valid compact JSON only.",
    "Do not include markdown fences, commentary, or hidden reasoning.",
    schemaDescription
  ].join("\n");
}
