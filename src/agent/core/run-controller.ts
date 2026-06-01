import type { AgentRunInput, AgentRunResult } from "../types.js";
import { AgentOrchestrator } from "./orchestrator.js";

export class RunController {
  private readonly orchestrator = new AgentOrchestrator();

  execute(input: AgentRunInput): Promise<AgentRunResult> {
    return this.orchestrator.run(input);
  }
}
