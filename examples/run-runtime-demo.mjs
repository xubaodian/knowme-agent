import { createDefaultRuntimeFromSkillDirectory } from "../agent-runtime/src/index.ts";

const runtime = createDefaultRuntimeFromSkillDirectory(
  "/Users/bytedance/projects/ai-projects/knowme-agent/skills"
);

const result = await runtime.handleRequest({
  requestId: "req_demo_001",
  userId: "user_001",
  sessionId: "session_demo_001",
  message: "请读取这个文件并生成 summary artifact，必要时使用文件能力。",
  attachments: [
    {
      id: "att_001",
      name: "architecture-plan.md",
      mimeType: "text/markdown",
      path: "/Users/bytedance/projects/ai-projects/knowme-agent/docs/architecture-plan.md"
    }
  ]
});

console.log(JSON.stringify(result.response, null, 2));
