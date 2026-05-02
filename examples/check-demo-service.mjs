import { getDemoRuntimeService } from "../agent-runtime/src/index.ts";

const service = getDemoRuntimeService();
const before = await service.getSnapshot();
const response = await service.runTask({
  message: "请帮我 inspect runtime，并执行 code 检查当前环境。"
});
const after = await service.getSnapshot();

console.log(
  JSON.stringify(
    {
      before: {
      status: before.currentTask.status,
      skillCount: before.skills.length
    },
      response: {
        summary: response.summary,
        selectedSkillIds: response.selectedSkillIds,
        sandboxCalls: response.sandboxCalls.length
      },
      after: {
        status: after.currentTask.status,
        traceCount: after.traces.length,
        latestSummary: after.latestResponse?.summary
      }
    },
    null,
    2
  )
);
