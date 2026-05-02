import { join } from "node:path";
import { createDefaultRuntimeFromSkillDirectory } from "../agent-runtime/src/runtime/create-runtime.ts";

const runtime = createDefaultRuntimeFromSkillDirectory(join(process.cwd(), "skills"));

const response = await runtime.handleRequest({
  requestId: "req_demo_004",
  userId: "user_001",
  sessionId: "session_demo_004",
  message: "Please inspect a webpage in the browser and summarize what is visible.",
  attachments: []
});

console.log(JSON.stringify(response.response, null, 2));
