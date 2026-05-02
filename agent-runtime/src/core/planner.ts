import type { TaskPlan } from "../shared.ts";
import type { RuntimeContext } from "../runtime/types.ts";

function shouldPlan(context: RuntimeContext): boolean {
  const { request } = context;
  return request.attachments.length > 0 || request.normalizedMessage.length > 80 || request.requestedCapabilities.length > 1;
}

export async function createTaskPlan(context: RuntimeContext): Promise<TaskPlan | undefined> {
  if (!shouldPlan(context)) {
    return undefined;
  }

  return {
    goal: context.request.normalizedMessage,
    steps: [
      {
        id: "step_understand",
        title: "Understand request",
        description: "Summarize the user goal and constraints.",
        status: "pending",
        dependsOn: [],
        selectedSkillIds: [],
        requiredCapabilities: [],
        expectedOutputs: ["task summary"]
      },
      {
        id: "step_execute",
        title: "Execute with selected skills",
        description: "Run skill steps and delegate environment actions to sandbox.",
        status: "pending",
        dependsOn: ["step_understand"],
        selectedSkillIds: [],
        requiredCapabilities: context.request.requestedCapabilities,
        expectedOutputs: ["skill results", "artifacts"]
      },
      {
        id: "step_finalize",
        title: "Finalize response",
        description: "Synthesize the final answer and update memory.",
        status: "pending",
        dependsOn: ["step_execute"],
        selectedSkillIds: [],
        requiredCapabilities: [],
        expectedOutputs: ["final response", "memory writes"]
      }
    ],
    dependencies: [
      { from: "step_understand", to: "step_execute" },
      { from: "step_execute", to: "step_finalize" }
    ],
    selectedSkills: [],
    requiredCapabilities: context.request.requestedCapabilities,
    expectedOutputs: ["final answer"],
    risks: []
  };
}
