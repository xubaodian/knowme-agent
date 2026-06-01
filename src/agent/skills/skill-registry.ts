import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export type SkillSummary = {
  name: string;
  description: string;
  directory: string;
};

export type LoadedSkill = SkillSummary & {
  content: string;
  path: string;
};

export class SkillRegistry {
  constructor(private readonly skillsRoot: string) {}

  async listSkills(): Promise<SkillSummary[]> {
    if (!(await pathExists(this.skillsRoot))) {
      return [];
    }

    const entries = await readdir(this.skillsRoot, { withFileTypes: true });
    const skills: SkillSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const directory = path.join(this.skillsRoot, entry.name);
      const skillPath = path.join(directory, "SKILL.md");

      if (!(await pathExists(skillPath))) {
        continue;
      }

      const content = await readFile(skillPath, "utf8");
      const parsed = parseSkill(content, entry.name);
      skills.push({ ...parsed, directory });
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  async loadSkill(name: string, relativePath = "SKILL.md"): Promise<LoadedSkill> {
    const skills = await this.listSkills();
    const skill = skills.find((item) => item.name === name || path.basename(item.directory) === name);

    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }

    const targetPath = resolveInside(skill.directory, relativePath);
    const content = await readFile(targetPath, "utf8");

    return {
      ...skill,
      content,
      path: targetPath
    };
  }
}

function parseSkill(content: string, fallbackName: string): Pick<SkillSummary, "description" | "name"> {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);

  if (frontmatter) {
    const values = new Map<string, string>();

    for (const line of frontmatter[1].split("\n")) {
      const separator = line.indexOf(":");

      if (separator === -1) {
        continue;
      }

      values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^"|"$/g, ""));
    }

    return {
      name: values.get("name") || fallbackName,
      description: values.get("description") || extractDescription(content)
    };
  }

  return {
    name: fallbackName,
    description: extractDescription(content)
  };
}

function extractDescription(content: string) {
  const lines = content
    .replace(/^---\n[\s\S]*?\n---/, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  return lines[0] ?? "No description provided.";
}

function resolveInside(root: string, relativePath: string) {
  const resolved = path.resolve(root, relativePath);
  const normalizedRoot = path.resolve(root);

  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Path escapes skill directory: ${relativePath}`);
  }

  return resolved;
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}
