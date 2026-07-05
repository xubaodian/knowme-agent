import path from "node:path";
import { SkillRegistry } from "../../agent/skills/skill-registry.js";
import type { ListSkillsResponse, SkillOption } from "../../shared/types.js";

export const genericProfileName = "general-agent";
const defaultSkillName = process.env.KNOWME_DEFAULT_SKILL || "general-task";

export async function listSkillOptions(): Promise<ListSkillsResponse> {
  const skills = await getSkillRegistry().listSkills();

  return {
    defaultSkillName: getDefaultSkillName(),
    skills: [
      {
        name: genericProfileName,
        description: "通用执行 profile：不加载专用 SKILL.md，由 runtime 根据请求规划和执行。",
        kind: "generic"
      },
      ...skills.map<SkillOption>((skill) => ({
        name: skill.name,
        description: skill.description,
        kind: "skill"
      }))
    ]
  };
}

export async function assertKnownSkill(skillName: string | undefined): Promise<void> {
  if (!skillName || isGenericProfileName(skillName)) {
    return;
  }

  const skills = await getSkillRegistry().listSkills();

  if (!skills.some((skill) => skill.name === skillName)) {
    throw new Error(`Unknown skill: ${skillName}`);
  }
}

export function normalizeSkillName(skillName: string | undefined): string | undefined {
  const normalized = skillName?.trim();
  return normalized && !isGenericProfileName(normalized) ? normalized : undefined;
}

export function isGenericProfileName(skillName: string): boolean {
  return skillName === genericProfileName;
}

export function getDefaultSkillName(): string {
  return process.env.KNOWME_DEFAULT_SKILL || defaultSkillName;
}

export function getSkillRegistry(): SkillRegistry {
  return new SkillRegistry(path.join(process.cwd(), "agent", "skills"));
}
