import type { Artifact, JsonValue, SkillExecution, SkillSpec } from "../shared.ts";
import type {
  LlmExecutor,
  RuntimeContext,
  SandboxService,
  SkillControlAction,
  SkillLoopAction,
  SkillRuntimeResult,
  SkillSessionState,
  SkillToolAction,
  SkillToolActionName
} from "../runtime/types.ts";

const MAX_SKILL_ITERATIONS = 8;

function createInitialSessionState(skill: SkillSpec, context: RuntimeContext): SkillSessionState {
  return {
    iteration: 0,
    maxIterations: MAX_SKILL_ITERATIONS,
    requestSummary: context.request.normalizedMessage,
    availableAttachments: context.request.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      path: attachment.path
    })),
    availableReferences: skill.referencePaths ?? [],
    availableScripts: skill.scriptPaths ?? [],
    allowedTools: deriveAllowedTools(skill),
    observations: [],
    readFiles: [],
    writtenFiles: [],
    generatedArtifacts: [],
    completed: false
  };
}

function deriveAllowedTools(skill: SkillSpec): SkillToolActionName[] {
  const allowed = new Set<SkillToolActionName>();
  const content = (skill.content ?? "").toLowerCase();
  const combined = `${skill.description} ${skill.content ?? ""}`.toLowerCase();

  if (skill.referencePaths && skill.referencePaths.length > 0) {
    allowed.add("read_file");
  }

  if (skill.requires.includes("fs.read") || skill.inputs.includes("file") || combined.includes("file") || combined.includes("document")) {
    allowed.add("read_file");
  }

  if (skill.requires.includes("fs.write") || combined.includes("write") || combined.includes("report")) {
    allowed.add("write_file");
  }

  if (
    skill.scriptPaths?.some((path) => path.endsWith(".py") || path.endsWith(".js")) ||
    skill.requires.some((item) => item.startsWith("code.run")) ||
    combined.includes("code") ||
    combined.includes("analysis")
  ) {
    allowed.add("run_code");
  }

  if (
    skill.requires.some((item) => item.startsWith("exec.")) ||
    combined.includes("command") ||
    combined.includes("runtime") ||
    combined.includes("environment")
  ) {
    allowed.add("run_command");
  }

  if (skill.requires.some((item) => item.startsWith("browser.")) || combined.includes("browser") || combined.includes("web")) {
    allowed.add("browser_open");
    allowed.add("browser_snapshot");
    allowed.add("browser_act");
    allowed.add("browser_extract");
    allowed.add("browser_screenshot");
  }

  return [...allowed];
}

function buildSkillPrompt(skill: SkillSpec, state: SkillSessionState): string {
  const lines = [
    "You are executing a single skill inside a constrained agent runtime.",
    "Choose exactly one next action as valid JSON.",
    "",
    `Skill name: ${skill.name}`,
    `Skill description: ${skill.description}`,
    "",
    "Skill instructions:",
    skill.content ?? "",
    "",
    "Allowed tool actions:",
    ...state.allowedTools.map((tool) => `- ${tool}`),
    "",
    "Allowed control actions:",
    "- finish",
    "- fail",
    "- request_input",
    "- delegate",
    "",
    "Available attachments:",
    ...(state.availableAttachments.length > 0
      ? state.availableAttachments.map((attachment) => `- ${attachment.name}: ${attachment.path}`)
      : ["- none"]),
    "",
    "Available references:",
    ...(state.availableReferences.length > 0
      ? state.availableReferences.map((path) => `- ${path}`)
      : ["- none"]),
    "",
    "Available helper scripts:",
    ...(state.availableScripts.length > 0
      ? state.availableScripts.map((path) => `- ${path}`)
      : ["- none"]),
    "",
    "Current observations:",
    ...(state.observations.length > 0
      ? state.observations.map((item) => `- ${item.title}: ${item.content}`)
      : ["- none"]),
    "",
    "User request:",
    state.requestSummary,
    "",
    "Respond with JSON only using one of these shapes:",
    '{"kind":"tool","tool":"read_file","reason":"...","input":{"path":"..."}}',
    '{"kind":"tool","tool":"write_file","reason":"...","input":{"path":"...","content":"..."}}',
    '{"kind":"tool","tool":"run_code","reason":"...","input":{"language":"javascript|python","source":"..."}}',
    '{"kind":"tool","tool":"run_command","reason":"...","input":{"command":"...","args":["..."]}}',
    '{"kind":"tool","tool":"browser_open","reason":"...","input":{"url":"..."}}',
    '{"kind":"tool","tool":"browser_snapshot","reason":"...","input":{"tabId":"optional"}}',
    '{"kind":"tool","tool":"browser_act","reason":"...","input":{"ref":"...","action":"click|type|select|scroll","text":"optional","option":"optional"}}',
    '{"kind":"tool","tool":"browser_extract","reason":"...","input":{"goal":"optional","ref":"optional"}}',
    '{"kind":"tool","tool":"browser_screenshot","reason":"...","input":{"ref":"optional","fullPage":true}}',
    '{"kind":"control","action":"finish","reason":"...","input":{"summary":"...","result":"optional"}}',
    '{"kind":"control","action":"fail","reason":"...","input":{"message":"..."}}',
    '{"kind":"control","action":"request_input","reason":"...","input":{"message":"..."}}',
    '{"kind":"control","action":"delegate","reason":"...","input":{"goal":"...","handoff_state":"..."}}'
  ];

  return lines.join("\n");
}

function extractJsonObject(text: string): string {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    throw new Error(`Skill action was not valid JSON: ${text}`);
  }

  return objectMatch[0];
}

function parseSkillAction(raw: JsonValue): SkillLoopAction {
  if (typeof raw !== "string") {
    throw new Error("Skill action response must be a JSON string");
  }

  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  if (parsed.kind === "tool" && typeof parsed.tool === "string" && typeof parsed.reason === "string") {
    const input = isJsonRecord(parsed.input) ? parsed.input : {};
    switch (parsed.tool) {
      case "read_file":
        return {
          kind: "tool",
          tool: "read_file",
          reason: parsed.reason,
          input: {
            path: typeof input.path === "string" ? input.path : ""
          }
        };
      case "write_file":
        return {
          kind: "tool",
          tool: "write_file",
          reason: parsed.reason,
          input: {
            path: typeof input.path === "string" ? input.path : "",
            content: typeof input.content === "string" ? input.content : ""
          }
        };
      case "run_code":
        return {
          kind: "tool",
          tool: "run_code",
          reason: parsed.reason,
          input: {
            language: typeof input.language === "string" ? input.language : "",
            source: typeof input.source === "string" ? input.source : ""
          }
        };
      case "run_command":
        return {
          kind: "tool",
          tool: "run_command",
          reason: parsed.reason,
          input: {
            command: typeof input.command === "string" ? input.command : "",
            ...(Array.isArray(input.args) ? { args: input.args } : {})
          }
        };
      case "browser_open":
        return {
          kind: "tool",
          tool: "browser_open",
          reason: parsed.reason,
          input: {
            url: typeof input.url === "string" ? input.url : ""
          }
        };
      case "browser_snapshot":
        return {
          kind: "tool",
          tool: "browser_snapshot",
          reason: parsed.reason,
          input: typeof input.tabId === "string" ? { tabId: input.tabId } : {}
        };
      case "browser_act":
        return {
          kind: "tool",
          tool: "browser_act",
          reason: parsed.reason,
          input: {
            ref: typeof input.ref === "string" ? input.ref : "",
            action: typeof input.action === "string" ? input.action : "",
            ...(typeof input.text === "string" ? { text: input.text } : {}),
            ...(typeof input.option === "string" ? { option: input.option } : {})
          }
        };
      case "browser_extract":
        return {
          kind: "tool",
          tool: "browser_extract",
          reason: parsed.reason,
          input: {
            ...(typeof input.goal === "string" ? { goal: input.goal } : {}),
            ...(typeof input.ref === "string" ? { ref: input.ref } : {})
          }
        };
      case "browser_screenshot":
        return {
          kind: "tool",
          tool: parsed.tool,
          reason: parsed.reason,
          input: {
            ...(typeof input.ref === "string" ? { ref: input.ref } : {}),
            ...(typeof input.fullPage === "boolean" ? { fullPage: input.fullPage } : {})
          }
        };
    }
  }

  if (parsed.kind === "control" && typeof parsed.action === "string" && typeof parsed.reason === "string") {
    const input = isJsonRecord(parsed.input) ? parsed.input : {};
    switch (parsed.action) {
      case "finish":
        return {
          kind: "control",
          action: "finish",
          reason: parsed.reason,
          input: {
            summary: typeof input.summary === "string" ? input.summary : "",
            ...(input.result !== undefined ? { result: input.result } : {})
          }
        };
      case "fail":
        return {
          kind: "control",
          action: "fail",
          reason: parsed.reason,
          input: {
            message: typeof input.message === "string" ? input.message : ""
          }
        };
      case "request_input":
        return {
          kind: "control",
          action: "request_input",
          reason: parsed.reason,
          input: {
            message: typeof input.message === "string" ? input.message : ""
          }
        };
      case "delegate":
        return {
          kind: "control",
          action: "delegate",
          reason: parsed.reason,
          input: {
            goal: typeof input.goal === "string" ? input.goal : "",
            ...(input.handoff_state !== undefined
              ? { handoff_state: input.handoff_state }
              : {})
          }
        };
    }
  }

  throw new Error(`Unrecognized skill action payload: ${raw}`);
}

function isJsonRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateAction(action: SkillLoopAction, state: SkillSessionState): void {
  if (action.kind === "tool") {
    if (!state.allowedTools.includes(action.tool)) {
      throw new Error(`Tool "${action.tool}" is not allowed for this skill session`);
    }

    switch (action.tool) {
      case "read_file":
        if (typeof action.input.path !== "string") {
          throw new Error("read_file requires a string path");
        }
        return;
      case "write_file":
        if (typeof action.input.path !== "string" || typeof action.input.content !== "string") {
          throw new Error("write_file requires string path and content");
        }
        return;
      case "run_code":
        if (
          typeof action.input.language !== "string" ||
          typeof action.input.source !== "string"
        ) {
          throw new Error("run_code requires language and source");
        }
        return;
      case "run_command":
        if (typeof action.input.command !== "string") {
          throw new Error("run_command requires a command");
        }
        return;
      case "browser_open":
        if (typeof action.input.url !== "string" || action.input.url.length === 0) {
          throw new Error("browser_open requires a url");
        }
        return;
      case "browser_act":
        if (typeof action.input.ref !== "string" || typeof action.input.action !== "string") {
          throw new Error("browser_act requires ref and action");
        }
        return;
      default:
        return;
    }
  }

  if (action.kind === "control") {
    switch (action.action) {
      case "finish":
        if (typeof action.input.summary !== "string") {
          throw new Error("finish requires a summary");
        }
        return;
      case "fail":
      case "request_input":
        if (typeof action.input.message !== "string") {
          throw new Error(`${action.action} requires a message`);
        }
        return;
      case "delegate":
        if (typeof action.input.goal !== "string") {
          throw new Error("delegate requires a goal");
        }
        return;
      default:
        throw new Error("Unsupported control action");
    }
  }
}

function summarizeOutput(output: JsonValue | undefined): string {
  if (output === undefined) {
    return "completed";
  }

  if (typeof output === "string") {
    return output.length > 500 ? `${output.slice(0, 500)}...` : output;
  }

  return JSON.stringify(output);
}

function updateSessionAfterToolCall(
  state: SkillSessionState,
  action: SkillToolAction,
  output: JsonValue | undefined,
  artifactPath?: string
): void {
  state.observations.push({
    stepId: `step_${state.iteration}_${action.tool}`,
    title: action.tool,
    content: summarizeOutput(output)
  });

  if (action.tool === "read_file" && typeof action.input.path === "string") {
    state.readFiles.push(action.input.path);
  }

  if (action.tool === "write_file" && typeof action.input.path === "string") {
    state.writtenFiles.push(action.input.path);
  }

  if (artifactPath) {
    state.generatedArtifacts.push(artifactPath);
  }
}

function buildExecutionResult(
  skill: SkillSpec,
  context: RuntimeContext,
  status: SkillExecution["status"],
  outputs: Record<string, JsonValue>,
  stepResults: SkillExecution["stepResults"],
  sandboxCalls: SkillRuntimeResult["sandboxCalls"],
  artifacts: Artifact[]
): SkillRuntimeResult {
  return {
    execution: {
      skillId: skill.id,
      status,
      inputs: {
        message: context.request.normalizedMessage,
        attachmentCount: context.request.attachments.length
      },
      outputs,
      stepResults
    },
    sandboxCalls,
    artifacts
  };
}

export async function executeSkill(
  skill: SkillSpec,
  context: RuntimeContext,
  llmExecutor: LlmExecutor,
  sandbox: SandboxService
): Promise<SkillRuntimeResult> {
  const state = createInitialSessionState(skill, context);
  const outputs: Record<string, JsonValue> = {};
  const stepResults: SkillExecution["stepResults"] = [];
  const sandboxCalls: SkillRuntimeResult["sandboxCalls"] = [];
  const artifacts: Artifact[] = [];

  while (!state.completed && state.iteration < state.maxIterations) {
    state.iteration += 1;

    const decision = await llmExecutor.run(
      "llm.skill_action",
      {
        skillId: skill.id,
        prompt: buildSkillPrompt(skill, state),
        availableAttachments: state.availableAttachments as unknown as JsonValue,
        observations: state.observations as unknown as JsonValue
      },
      context
    );

    const action = parseSkillAction(decision.output);
    validateAction(action, state);

    if (action.kind === "control") {
      const controlResult = handleControlAction(action, state, stepResults, outputs);
      if (controlResult.status !== "running") {
        return buildExecutionResult(
          skill,
          context,
          controlResult.status,
          outputs,
          stepResults,
          sandboxCalls,
          artifacts
        );
      }
      continue;
    }

    const stepId = `step_${state.iteration}_${action.tool}`;
    const sandboxResult = await sandbox.executeTool({
      request: context.request,
      skillId: skill.id,
      stepId,
      tool: action.tool,
      reason: action.reason,
      input: action.input
    });
    sandboxCalls.push(sandboxResult.call);

    if (sandboxResult.result.artifact) {
      artifacts.push(sandboxResult.result.artifact);
    }

    updateSessionAfterToolCall(
      state,
      action,
      sandboxResult.result.output,
      sandboxResult.result.artifact?.path
    );

    stepResults.push({
      stepId,
      status: "completed",
      ...(sandboxResult.result.output !== undefined
        ? { output: sandboxResult.result.output }
        : {})
    });
  }

  outputs.failure = "Skill loop exceeded the maximum iteration count.";
  stepResults.push({
    stepId: `step_${state.iteration + 1}_fail`,
    status: "failed",
    error: "Skill loop exceeded the maximum iteration count."
  });

  return buildExecutionResult(
    skill,
    context,
    "failed",
    outputs,
    stepResults,
    sandboxCalls,
    artifacts
  );
}

function handleControlAction(
  action: SkillControlAction,
  state: SkillSessionState,
  stepResults: SkillExecution["stepResults"],
  outputs: Record<string, JsonValue>
): { status: SkillExecution["status"] | "running" } {
  const stepId = `step_${state.iteration}_${action.action}`;

  switch (action.action) {
    case "finish":
      state.completed = true;
      outputs.summary = action.input.summary;
      if (action.input.result !== undefined) {
        outputs.result = action.input.result;
      }
      stepResults.push({
        stepId,
        status: "completed",
        output: action.input.summary
      });
      return { status: "completed" };
    case "fail":
      state.completed = true;
      outputs.failure = action.input.message;
      stepResults.push({
        stepId,
        status: "failed",
        error: String(action.input.message)
      });
      return { status: "failed" };
    case "request_input":
      state.completed = true;
      outputs.request_input = action.input.message;
      stepResults.push({
        stepId,
        status: "completed",
        output: action.input.message
      });
      return { status: "completed" };
    case "delegate":
      state.completed = true;
      outputs.delegate = action.input;
      stepResults.push({
        stepId,
        status: "completed",
        output: action.input
      });
      return { status: "completed" };
  }
}
