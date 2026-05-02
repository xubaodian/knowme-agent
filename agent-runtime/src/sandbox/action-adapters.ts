import type {
  SandboxActionAdapter,
  SandboxCallInput,
  SkillToolActionName,
  ToolExecutionRequest
} from "../runtime/types.ts";

class StaticToolActionAdapter implements SandboxActionAdapter {
  readonly tool: SkillToolActionName;
  private readonly capability: string;
  private readonly action: string;

  constructor(input: { tool: SkillToolActionName; capability: string; action: string }) {
    this.tool = input.tool;
    this.capability = input.capability;
    this.action = input.action;
  }

  toSandboxCallInput(request: ToolExecutionRequest): SandboxCallInput {
    return {
      request: request.request,
      skillId: request.skillId,
      stepId: request.stepId,
      capability: this.capability,
      action: this.action,
      input: request.input
    };
  }
}

export function createDefaultSandboxActionAdapters(): SandboxActionAdapter[] {
  return [
    new StaticToolActionAdapter({
      tool: "read_file",
      capability: "fs.read",
      action: "read"
    }),
    new StaticToolActionAdapter({
      tool: "write_file",
      capability: "fs.write",
      action: "write"
    }),
    new StaticToolActionAdapter({
      tool: "run_code",
      capability: "code.run",
      action: "run"
    }),
    new StaticToolActionAdapter({
      tool: "run_command",
      capability: "exec.run",
      action: "run"
    }),
    new StaticToolActionAdapter({
      tool: "browser_open",
      capability: "browser.open",
      action: "open"
    }),
    new StaticToolActionAdapter({
      tool: "browser_snapshot",
      capability: "browser.snapshot",
      action: "snapshot"
    }),
    new StaticToolActionAdapter({
      tool: "browser_act",
      capability: "browser.act",
      action: "act"
    }),
    new StaticToolActionAdapter({
      tool: "browser_extract",
      capability: "browser.extract",
      action: "extract"
    }),
    new StaticToolActionAdapter({
      tool: "browser_screenshot",
      capability: "browser.screenshot",
      action: "screenshot"
    })
  ];
}
