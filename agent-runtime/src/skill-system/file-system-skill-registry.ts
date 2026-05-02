import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { SkillRegistryEntry, SkillSpec } from "../shared.ts";
import type { SkillRegistry } from "../runtime/types.ts";
import { loadClaudeMarkdownSkill } from "./skill-manifest.ts";
import { FileSkillStateStore } from "./file-skill-state-store.ts";

async function discoverSkillFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(rootDir, entry.name);
      if (entry.isDirectory()) {
        const directSkillFile = join(absolutePath, "SKILL.md");
        try {
          const childEntries = await readdir(absolutePath, { withFileTypes: true });
          const hasSkill = childEntries.some(
            (child) => child.isFile() && child.name === "SKILL.md"
          );
          if (hasSkill) {
            return [directSkillFile];
          }
        } catch {
          return [];
        }

        return discoverSkillFiles(absolutePath);
      }

      return [];
    })
  );

  return nested.flat();
}

async function buildSkillIndex(rootDir: string): Promise<Map<string, string>> {
  const files = await discoverSkillFiles(rootDir);
  const pairs = await Promise.all(
    files.map(async (filePath) => {
      const skill = await loadClaudeMarkdownSkill(filePath);
      return [skill.id, filePath] as const;
    })
  );

  return new Map(pairs);
}

export class FileSystemSkillRegistry implements SkillRegistry {
  private readonly rootDir: string;
  private readonly stateStore: FileSkillStateStore;

  constructor(rootDir: string, stateFilePath = join(rootDir, ".skill-registry-state.json")) {
    this.rootDir = rootDir;
    this.stateStore = new FileSkillStateStore(stateFilePath);
  }

  async listEntries(): Promise<SkillRegistryEntry[]> {
    const files = await discoverSkillFiles(this.rootDir);
    const disabled = new Set(await this.stateStore.listDisabledSkillIds());
    const entries = await Promise.all(
      files.map(async (filePath) => {
        const skill = await loadClaudeMarkdownSkill(filePath);
        return {
          skillId: skill.id,
          name: skill.name,
          description: skill.description,
          enabled: !disabled.has(skill.id),
          source: skill.source,
          manifestPath: filePath
        } satisfies SkillRegistryEntry;
      })
    );

    return entries;
  }

  async loadSkill(skillId: string): Promise<SkillSpec> {
    const index = await buildSkillIndex(this.rootDir);
    const skillFile = index.get(skillId);
    if (!skillFile) {
      throw new Error(`Unknown skill: ${skillId}`);
    }

    return loadClaudeMarkdownSkill(skillFile);
  }

  async setEnabled(skillId: string, enabled: boolean): Promise<void> {
    await this.stateStore.setEnabled(skillId, enabled);
  }
}
