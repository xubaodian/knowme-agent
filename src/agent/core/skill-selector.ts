import type { LlmProvider } from "../llm/types.js";
import { completeWithLogging } from "../llm/llm-runner.js";
import type { RunTraceRecorder } from "../../logging/trace.js";
import { buildSkillSelectionSystemPrompt } from "../prompts/index.js";
import type { LoadedSkill, SkillSummary } from "../skills/skill-registry.js";
import type { ToolRunner } from "../tools/tool-runner.js";
import type { AgentEventBus } from "./event-bus.js";

export async function selectAndLoadSkill(options: {
  prompt: string;
  skills: SkillSummary[];
  llmProvider: LlmProvider;
  toolRunner: ToolRunner;
  eventBus: AgentEventBus;
  trace?: RunTraceRecorder;
  parentTraceId?: string;
}): Promise<LoadedSkill | undefined> {
  const traceNodeId = await options.trace?.startNode({
    parentId: options.parentTraceId ?? options.trace.rootNodeId,
    type: "phase",
    title: "Skill selection",
    summary: `${options.skills.length} candidate skill(s).`,
    input: {
      prompt: options.prompt,
      skills: options.skills
    },
    metadata: {
      candidateCount: options.skills.length
    }
  });

  if (options.skills.length === 0) {
    options.eventBus.runLogger.event("skill.selection.skipped", {
      reason: "no_skills"
    });
    options.eventBus.emit({
      type: "thought.created",
      title: "No skill selected",
      detail: "未发现本地 SKILL.md，使用通用 agent 指令执行。",
      status: "done",
      flowKind: "thought",
      visibility: "secondary"
    });
    await options.trace?.endNode(traceNodeId, {
      status: "skipped",
      summary: "No local skills found.",
      output: {
        selectedSkill: undefined
      }
    });
    return undefined;
  }

  try {
    const selectedName =
      options.skills.length === 1
        ? selectOnlySkill(options.skills[0].name, options.eventBus)
        : await askModelToSelectSkill(options.prompt, options.skills, options.llmProvider, options.eventBus, options.trace, traceNodeId);
    options.eventBus.runLogger.event("skill.load.requested", {
      skillName: selectedName,
      candidateCount: options.skills.length
    });
    const skillResult = await options.toolRunner.run("load_skill", { name: selectedName }, { traceParentId: traceNodeId });
    const loadedSkill = skillResult.data as LoadedSkill;

    options.eventBus.runLogger.event("skill.loaded", {
      skillName: loadedSkill.name,
      contentChars: loadedSkill.content.length,
      directory: loadedSkill.directory
    });
    await options.trace?.endNode(traceNodeId, {
      status: "success",
      summary: `Selected ${loadedSkill.name}.`,
      output: loadedSkill
    });

    return loadedSkill;
  } catch (error) {
    await options.trace?.endNode(traceNodeId, {
      status: "error",
      summary: error instanceof Error ? error.message : "Skill selection failed.",
      error
    });
    throw error;
  }
}

async function askModelToSelectSkill(
  prompt: string,
  skills: SkillSummary[],
  llmProvider: LlmProvider,
  eventBus: AgentEventBus,
  trace?: RunTraceRecorder,
  traceParentId?: string
): Promise<string> {
  const response = await completeWithLogging({
    provider: llmProvider,
    runLogger: eventBus.runLogger,
    trace,
    traceParentId,
    phase: "skill-selector",
    request: {
      temperature: 0,
      messages: [
        {
          role: "system",
          content: buildSkillSelectionSystemPrompt()
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt,
            skills: skills.map((skill) => ({
              name: skill.name,
              description: skill.description
            }))
          })
        }
      ]
    }
  });
  const parsed = JSON.parse(response.content) as { name?: string };
  const name = parsed.name;

  if (!name || !skills.some((skill) => skill.name === name)) {
    eventBus.runLogger.event(
      "skill.selection.invalid",
      {
        selectedName: name ?? "<empty>",
        candidateNames: skills.map((skill) => skill.name)
      },
      "warn"
    );
    throw new Error(`Model selected an unknown skill: ${name ?? "<empty>"}`);
  }

  eventBus.runLogger.event("skill.selection.model_selected", {
    selectedName: name,
    candidateCount: skills.length
  });

  return name;
}

function selectOnlySkill(name: string, eventBus: AgentEventBus): string {
  eventBus.runLogger.event("skill.selection.single_candidate", {
    selectedName: name
  });

  return name;
}
