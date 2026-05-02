import type { SkillRegistryEntry } from "../shared.ts";
import type { RuntimeContext, SkillSelection } from "../runtime/types.ts";

export interface SkillSelectionOptions {
  excludeSkillIds?: string[];
  maxSkills?: number;
  overrideMessage?: string;
}

function scoreSkill(skill: SkillRegistryEntry, context: RuntimeContext, messageOverride?: string): number {
  let score = 0;
  const message = (messageOverride ?? context.request.normalizedMessage).toLowerCase();

  const haystack = `${skill.name} ${skill.description}`.toLowerCase();
  for (const token of message.split(/\s+/).filter(Boolean)) {
    if (haystack.includes(token)) {
      score += 2;
    }
  }

  if (context.request.attachments.length > 0 && haystack.includes("file")) {
    score += 2;
  }

  return score;
}

export async function selectSkills(
  context: RuntimeContext,
  options: SkillSelectionOptions = {}
): Promise<SkillSelection> {
  const excluded = new Set(options.excludeSkillIds ?? []);
  const maxSkills = options.maxSkills ?? 1;

  const ranked = [...context.availableSkillEntries]
    .filter((skill) => skill.enabled && !excluded.has(skill.skillId))
    .map((skill) => ({ skill, score: scoreSkill(skill, context, options.overrideMessage) }))
    .sort((left, right) => right.score - left.score);

  const selectedSkillIds = ranked
    .filter((entry) => entry.score > 0)
    .slice(0, maxSkills)
    .map((entry) => entry.skill.skillId);

  return {
    ...(selectedSkillIds[0] ? { primarySkillId: selectedSkillIds[0] } : {}),
    selectedSkillIds,
    reason: selectedSkillIds.length > 0 ? "Selected by metadata match." : "No matching skill found."
  };
}
