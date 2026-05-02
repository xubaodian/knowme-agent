import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

interface SkillStateFile {
  disabledSkillIds: string[];
}

async function readStateFile(filePath: string): Promise<SkillStateFile> {
  try {
    const text = await readFile(filePath, "utf8");
    const parsed = JSON.parse(text) as Partial<SkillStateFile>;
    return {
      disabledSkillIds: Array.isArray(parsed.disabledSkillIds)
        ? parsed.disabledSkillIds.map(String)
        : []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { disabledSkillIds: [] };
    }

    throw error;
  }
}

export class FileSkillStateStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async listDisabledSkillIds(): Promise<string[]> {
    const state = await readStateFile(this.filePath);
    return state.disabledSkillIds;
  }

  async setEnabled(skillId: string, enabled: boolean): Promise<void> {
    const state = await readStateFile(this.filePath);
    const disabled = new Set(state.disabledSkillIds);

    if (enabled) {
      disabled.delete(skillId);
    } else {
      disabled.add(skillId);
    }

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      JSON.stringify({ disabledSkillIds: [...disabled] }, null, 2),
      "utf8"
    );
  }
}
