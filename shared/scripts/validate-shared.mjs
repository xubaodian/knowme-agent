import {
  isAgentRequest,
  isArtifact,
  isMemoryRecord,
  isSandboxCall,
  isSkillSpec,
  isTaskPlan
} from "../src/index.ts";

const request = {
  requestId: "req_001",
  userId: "user_001",
  sessionId: "session_001",
  message: "Summarize this file",
  attachments: []
};

const plan = {
  goal: "Summarize uploaded file",
  steps: [],
  dependencies: [],
  selectedSkills: ["skill.summarize-file"],
  requiredCapabilities: ["fs.read"],
  expectedOutputs: ["summary"],
  risks: []
};

const skill = {
  id: "skill.summarize-file",
  name: "Summarize File",
  description: "Reads a file and produces a summary",
  version: "0.1.0",
  source: "local",
  format: "structured",
  inputs: ["filePath"],
  outputs: ["summary"],
  steps: [],
  requires: ["fs.read"],
  permissions: ["workspace.read"],
  tags: ["file", "summary"]
};

const sandboxCall = {
  callId: "call_001",
  taskId: "task_001",
  skillId: "skill.summarize-file",
  stepId: "step_001",
  provider: "fs",
  capability: "fs.read",
  action: "read",
  input: { path: "./docs/file.txt" },
  status: "completed",
  startedAt: new Date().toISOString()
};

const memory = {
  id: "mem_001",
  scope: "profile",
  type: "preference",
  userId: "user_001",
  content: "Prefer concise output",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const artifact = {
  id: "artifact_001",
  type: "text",
  name: "summary.md",
  path: "./artifacts/summary.md",
  producer: "skill.summarize-file"
};

const checks = [
  ["AgentRequest", isAgentRequest(request)],
  ["TaskPlan", isTaskPlan(plan)],
  ["SkillSpec", isSkillSpec(skill)],
  ["SandboxCall", isSandboxCall(sandboxCall)],
  ["MemoryRecord", isMemoryRecord(memory)],
  ["Artifact", isArtifact(artifact)]
];

const failed = checks.filter(([, passed]) => !passed);

if (failed.length > 0) {
  const labels = failed.map(([label]) => label).join(", ");
  console.error(`Shared schema validation failed for: ${labels}`);
  process.exit(1);
}

console.log("Shared schema validation passed.");
