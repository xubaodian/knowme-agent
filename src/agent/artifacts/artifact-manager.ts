import type { Artifact, ArtifactDisplay, ArtifactKind, BaseArtifact } from "../../shared/types.js";
import type { AgentEventBus } from "../core/event-bus.js";
import type { Run } from "../../shared/types.js";

const now = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export class ArtifactManager {
  constructor(
    private readonly run: Run,
    private readonly eventBus: AgentEventBus,
    private readonly onArtifact: (artifact: Artifact) => void
  ) {}

  base(kind: ArtifactKind, title: string, display: ArtifactDisplay, description?: string): BaseArtifact {
    const timestamp = now();

    return {
      id: createId("art"),
      runId: this.run.id,
      chatId: this.run.chatId,
      kind,
      title,
      description,
      status: "ready",
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      display
    };
  }

  publish(artifact: Artifact): Artifact {
    this.eventBus.runLogger.event("artifact.publish", {
      artifactId: artifact.id,
      artifactKind: artifact.kind,
      artifactTitle: artifact.title,
      displayMode: artifact.display.mode,
      previewTarget: artifact.display.previewTarget,
      contentSize: estimateArtifactSize(artifact)
    });
    this.onArtifact(artifact);
    this.eventBus.emitArtifact(artifact);
    return artifact;
  }
}

function estimateArtifactSize(artifact: Artifact): number | undefined {
  if ("content" in artifact) {
    return artifact.content.length;
  }

  if ("rows" in artifact) {
    return artifact.rows.length;
  }

  if ("series" in artifact) {
    return artifact.series.length;
  }

  if ("slides" in artifact) {
    return artifact.slides.length;
  }

  if ("sizeBytes" in artifact) {
    return artifact.sizeBytes;
  }

  return undefined;
}
