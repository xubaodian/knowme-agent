import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Run } from "../../shared/types.js";
import type { LoadedSkill } from "../../agent/skills/skill-registry.js";

export type LocalRunWorkspace = {
  root: string;
  filesRoot: string;
  skillRoot: string;
  artifactsRoot: string;
  browserRoot: string;
};

export async function createLocalRunWorkspace(run: Run): Promise<LocalRunWorkspace> {
  const root = path.join(process.cwd(), ".knowme", "workspaces", safeSegment(run.id));
  const workspace: LocalRunWorkspace = {
    root,
    filesRoot: path.join(root, "files"),
    skillRoot: path.join(root, "skill"),
    artifactsRoot: path.join(root, "artifacts"),
    browserRoot: path.join(root, "browser")
  };

  await Promise.all([
    mkdir(workspace.filesRoot, { recursive: true }),
    mkdir(path.join(workspace.filesRoot, "inputs"), { recursive: true }),
    mkdir(path.join(workspace.filesRoot, "outputs"), { recursive: true }),
    mkdir(path.join(workspace.filesRoot, "tmp"), { recursive: true }),
    mkdir(workspace.skillRoot, { recursive: true }),
    mkdir(workspace.artifactsRoot, { recursive: true }),
    mkdir(workspace.browserRoot, { recursive: true })
  ]);
  await writeWorkspaceMeta(workspace, run);

  return workspace;
}

export async function snapshotSkillToWorkspace(skill: LoadedSkill | undefined, workspace: LocalRunWorkspace): Promise<LoadedSkill | undefined> {
  if (!skill) {
    return undefined;
  }

  await cp(skill.directory, workspace.skillRoot, {
    recursive: true,
    force: true
  });

  return {
    ...skill,
    directory: workspace.skillRoot,
    path: path.join(workspace.skillRoot, "SKILL.md")
  };
}

async function writeWorkspaceMeta(workspace: LocalRunWorkspace, run: Run): Promise<void> {
  await writeFile(
    path.join(workspace.root, "meta.json"),
    `${JSON.stringify(
      {
        runId: run.id,
        chatId: run.chatId,
        userMessageId: run.userMessageId,
        model: run.model,
        skillName: run.skillName,
        createdAt: new Date().toISOString(),
        layout: {
          files: "files",
          skill: "skill",
          artifacts: "artifacts",
          browser: "browser"
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}
