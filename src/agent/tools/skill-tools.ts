import type { AgentTool, ToolRunResult } from "../types.js";

type LoadSkillInput = {
  name: string;
  path?: string;
};

export function createSkillTools(): AgentTool[] {
  return [
    {
      name: "list_skills",
      description: "List available skills without loading their full instructions.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {}
      },
      summarizeInput: () => "扫描本地 skills 目录。",
      summarizeOutput: (output) => output.summary ?? "Skill 扫描完成。",
      async run(_, context): Promise<ToolRunResult> {
        const skills = await context.skillRegistry.listSkills();

        return {
          summary: skills.length > 0 ? `找到 ${skills.length} 个 skill。` : "未找到可用 skill，使用通用执行策略。",
          data: skills
        };
      }
    },
    {
      name: "load_skill",
      description: "Load SKILL.md or a referenced file inside a skill directory.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: { type: "string" },
          path: { type: "string", description: "Optional path inside the skill directory. Defaults to SKILL.md." }
        }
      },
      summarizeInput: (input) => {
        const value = input as LoadSkillInput;
        return `读取 skill: ${value.name}${value.path ? `/${value.path}` : ""}`;
      },
      summarizeOutput: (output) => output.summary ?? "Skill 已读取。",
      async run(input, context): Promise<ToolRunResult> {
        const value = input as LoadSkillInput;
        const skill = await context.skillRegistry.loadSkill(value.name, value.path);

        return {
          summary: `已读取 ${skill.name}。`,
          data: skill
        };
      }
    }
  ];
}
