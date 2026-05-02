import type { AgentRequest } from "../shared.ts";
import type { NormalizedRequest } from "../runtime/types.ts";

const capabilityHints: Array<{ keyword: string; capability: string }> = [
  { keyword: "browser", capability: "browser.open" },
  { keyword: "网页", capability: "browser.extract" },
  { keyword: "file", capability: "fs.read" },
  { keyword: "文件", capability: "fs.read" },
  { keyword: "code", capability: "code.run.javascript" },
  { keyword: "代码", capability: "code.run.javascript" },
  { keyword: "command", capability: "exec.shell" },
  { keyword: "命令", capability: "exec.shell" }
];

export function normalizeRequest(request: AgentRequest): NormalizedRequest {
  const normalizedMessage = request.message.trim().replace(/\s+/g, " ");
  const lower = normalizedMessage.toLowerCase();
  const requestedCapabilities = new Set<string>();

  for (const hint of capabilityHints) {
    if (lower.includes(hint.keyword.toLowerCase())) {
      requestedCapabilities.add(hint.capability);
    }
  }

  if (request.attachments.length > 0) {
    requestedCapabilities.add("fs.read");
  }

  return {
    ...request,
    normalizedMessage,
    requestedCapabilities: [...requestedCapabilities]
  };
}
