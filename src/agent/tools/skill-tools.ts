import type { AgentTool, ToolRunResult } from "../types.js";

type ReadSkillFileInput = {
  path?: string;
};

export function createSkillTools(): AgentTool[] {
  return [
    {
      name: "read_skill_file",
      description: "Read SKILL.md or a referenced file inside the already selected skill directory.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Optional path inside the selected skill directory. Defaults to SKILL.md." }
        }
      },
      summarizeInput: (input) => {
        const value = input as ReadSkillFileInput;
        return `读取当前 skill 文件：${value.path ?? "SKILL.md"}`;
      },
      summarizeOutput: (output) => output.summary ?? "Skill 文件已读取。",
      async run(input, context): Promise<ToolRunResult> {
        const value = input as ReadSkillFileInput;
        const skill = await context.skillRegistry.loadSkill(context.loadedSkill.name, value.path);

        return {
          summary: `已读取 ${skill.name}/${value.path ?? "SKILL.md"}。`,
          data: {
            name: skill.name,
            path: skill.path,
            content: skill.content
          }
        };
      }
    }
  ];
}
