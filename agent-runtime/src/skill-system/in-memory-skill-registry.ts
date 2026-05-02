import type { SkillRegistryEntry, SkillSpec } from "../shared.ts";
import type { SkillRegistry } from "../runtime/types.ts";

export class InMemorySkillRegistry implements SkillRegistry {
  private readonly skills: SkillSpec[];

  constructor(skills: SkillSpec[]) {
    this.skills = skills;
  }

  async listEntries(): Promise<SkillRegistryEntry[]> {
    return this.skills.map((skill) => ({
      skillId: skill.id,
      name: skill.name,
      description: skill.description,
      enabled: true,
      source: skill.source,
      manifestPath: skill.entryPath ?? skill.name
    }));
  }

  async loadSkill(skillId: string): Promise<SkillSpec> {
    const skill = this.skills.find((item) => item.id === skillId);
    if (!skill) {
      throw new Error(`Unknown in-memory skill: ${skillId}`);
    }

    return skill;
  }
}
