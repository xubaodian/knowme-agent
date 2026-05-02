import { join } from "node:path";
import { createDefaultRuntimeFromSkillDirectory } from "../agent-runtime/src/runtime/create-runtime.ts";

const runtime = createDefaultRuntimeFromSkillDirectory(join(process.cwd(), "skills"));

const response = await runtime.handleRequest({
  requestId: "req_demo_003",
  userId: "user_001",
  sessionId: "session_demo_003",
  message: "Please analyze this file and hand off the concrete work to the right skill.",
  attachments: [
    {
      id: "att_001",
      name: "architecture-plan.md",
      mimeType: "text/markdown",
      path: join(process.cwd(), "docs", "architecture-plan.md")
    }
  ]
});

console.log(JSON.stringify(response.response, null, 2));
