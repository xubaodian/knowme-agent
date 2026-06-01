import type { Artifact, Run, RunEvent } from "../../shared/types.js";
import type { RunLogger } from "../../logging/index.js";
import { summarizeText } from "../../logging/index.js";
import type { AgentEventDraft } from "../types.js";

const now = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export class AgentEventBus {
  private sequence = 0;

  constructor(
    private readonly run: Run,
    private readonly onEvent: (event: RunEvent) => void,
    readonly runLogger: RunLogger
  ) {}

  emit(draft: AgentEventDraft): RunEvent {
    const event: RunEvent = {
      id: createId("evt"),
      runId: this.run.id,
      chatId: this.run.chatId,
      createdAt: now(),
      sequence: ++this.sequence,
      ...draft
    };

    this.onEvent(event);
    this.runLogger.event(
      "agent.event",
      {
        eventType: event.type,
        eventSequence: event.sequence,
        title: event.title,
        status: event.status,
        flowKind: event.flowKind,
        visibility: event.visibility,
        artifactId: event.artifactId,
        actionCount: event.actions?.length ?? 0,
        detail: summarizeText(event.detail, 300)
      },
      event.visibility === "debug" || event.visibility === "internal" ? "debug" : "info"
    );
    return event;
  }

  emitArtifact(artifact: Artifact): RunEvent {
    return this.emit({
      type: "artifact.created",
      title: `Artifact: ${artifact.title}`,
      detail: artifact.description,
      status: "done",
      artifactId: artifact.id,
      flowKind: "artifact",
      visibility: artifact.display.mode === "hidden" ? "internal" : "primary",
      actions:
        artifact.display.mode === "button" || artifact.display.mode === "preview"
          ? [
              {
                id: createId("act"),
                kind: "open_artifact",
                label: artifact.display.label ?? "打开预览",
                targetId: artifact.id
              }
            ]
          : undefined,
      payload: { artifact }
    });
  }
}
