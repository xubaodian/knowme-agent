import path from "node:path";
import { SkillRegistry } from "../../agent/skills/skill-registry.js";
import type { ListSkillsResponse, SkillOption } from "../../shared/types.js";

const defaultSkillName = process.env.KNOWME_DEFAULT_SKILL || "general-task";

export async function listSkillOptions(): Promise<ListSkillsResponse> {
  const skills = await getSkillRegistry().listSkills();

  return {
    defaultSkillName: getDefaultSkillName(),
    skills: skills.map<SkillOption>((skill) => ({
      name: skill.name,
      description: skill.description
    }))
  };
}

export async function assertKnownSkill(skillName: string): Promise<void> {
  const skills = await getSkillRegistry().listSkills();

  if (!skills.some((skill) => skill.name === skillName)) {
    throw new Error(`Unknown skill: ${skillName}`);
  }
}

export function getDefaultSkillName(): string {
  return process.env.KNOWME_DEFAULT_SKILL || defaultSkillName;
}

export function getSkillRegistry(): SkillRegistry {
  return new SkillRegistry(path.join(process.cwd(), "agent", "skills"));
}
