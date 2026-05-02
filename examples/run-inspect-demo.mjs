import { createDefaultRuntimeFromSkillDirectory } from "../agent-runtime/src/index.ts";

const runtime = createDefaultRuntimeFromSkillDirectory(
  "/Users/bytedance/projects/ai-projects/knowme-agent/skills"
);

const result = await runtime.handleRequest({
  requestId: "req_demo_002",
  userId: "user_001",
  sessionId: "session_demo_002",
  message: "请帮我 inspect runtime，并执行 code 检查当前环境。",
  attachments: []
});

console.log(JSON.stringify(result.response, null, 2));
