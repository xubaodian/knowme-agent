import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { type SkillSpec } from "../shared.ts";

interface Frontmatter {
  name: string;
  description: string;
  version?: string;
  source?: string;
  tags?: string[];
  requires?: string[];
  permissions?: string[];
  inputs?: string[];
  outputs?: string[];
}

interface ParsedSkillMarkdown {
  frontmatter: Frontmatter;
  body: string;
}

function parseListValue(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFrontmatterValue(key: string, rawValue: string): string | string[] {
  const trimmed = rawValue.trim();
  if (
    key === "tags" ||
    key === "requires" ||
    key === "permissions" ||
    key === "inputs" ||
    key === "outputs"
  ) {
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return parseListValue(trimmed.slice(1, -1));
    }
    return parseListValue(trimmed);
  }

  return trimmed.replace(/^["']|["']$/g, "");
}

export function parseSkillMarkdown(text: string): ParsedSkillMarkdown {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("SKILL.md must start with YAML frontmatter");
  }

  const rawFrontmatter = match[1] ?? "";
  const body = match[2] ?? "";
  const frontmatter: Record<string, string | string[]> = {};

  for (const line of rawFrontmatter.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    frontmatter[key] = parseFrontmatterValue(key, rawValue);
  }

  if (typeof frontmatter.name !== "string" || typeof frontmatter.description !== "string") {
    throw new Error("SKILL.md frontmatter requires name and description");
  }

  return {
    frontmatter: {
      name: frontmatter.name,
      description: frontmatter.description,
      ...(typeof frontmatter.version === "string" ? { version: frontmatter.version } : {}),
      ...(typeof frontmatter.source === "string" ? { source: frontmatter.source } : {}),
      ...(Array.isArray(frontmatter.tags) ? { tags: frontmatter.tags } : {}),
      ...(Array.isArray(frontmatter.requires) ? { requires: frontmatter.requires } : {}),
      ...(Array.isArray(frontmatter.permissions) ? { permissions: frontmatter.permissions } : {}),
      ...(Array.isArray(frontmatter.inputs) ? { inputs: frontmatter.inputs } : {}),
      ...(Array.isArray(frontmatter.outputs) ? { outputs: frontmatter.outputs } : {})
    },
    body: body.trim()
  };
}

async function discoverFilesByFolder(rootDir: string, folderName: string): Promise<string[]> {
  try {
    const dirPath = join(rootDir, folderName);
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(dirPath, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function loadClaudeMarkdownSkill(skillFilePath: string): Promise<SkillSpec> {
  const raw = await readFile(skillFilePath, "utf8");
  const parsed = parseSkillMarkdown(raw);
  const skillDir = dirname(skillFilePath);
  const slug = basename(skillDir);

  return {
    id: parsed.frontmatter.name,
    name: parsed.frontmatter.name,
    description: parsed.frontmatter.description,
    version: parsed.frontmatter.version ?? "0.1.0",
    source: parsed.frontmatter.source ?? "project-skill",
    format: "claude-markdown",
    inputs: parsed.frontmatter.inputs ?? [],
    outputs: parsed.frontmatter.outputs ?? ["result"],
    steps: [],
    requires: parsed.frontmatter.requires ?? [],
    permissions: parsed.frontmatter.permissions ?? [],
    tags: parsed.frontmatter.tags ?? slug.split("-"),
    entryPath: skillFilePath,
    skillDir,
    content: parsed.body,
    scriptPaths: await discoverFilesByFolder(skillDir, "scripts"),
    referencePaths: await discoverFilesByFolder(skillDir, "references")
  };
}
