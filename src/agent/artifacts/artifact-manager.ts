import type { Artifact, ArtifactDisplay, ArtifactKind, BaseArtifact } from "../../shared/types.js";
import type { AgentEventBus } from "../core/event-bus.js";
import type { Run } from "../../shared/types.js";

const now = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export class ArtifactManager {
  private readonly publishedArtifacts: Artifact[] = [];

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
    this.publishedArtifacts.push(artifact);
    this.onArtifact(artifact);
    this.eventBus.emitArtifact(artifact);
    return artifact;
  }

  update(artifactId: string, patch: Partial<Artifact>): Artifact {
    const index = this.publishedArtifacts.findIndex((artifact) => artifact.id === artifactId);

    if (index === -1) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    const previous = this.publishedArtifacts[index];
    const updated = {
      ...previous,
      ...patch,
      id: previous.id,
      runId: previous.runId,
      chatId: previous.chatId,
      kind: previous.kind,
      createdAt: previous.createdAt,
      updatedAt: now(),
      version: previous.version + 1
    } as Artifact;

    this.publishedArtifacts[index] = updated;
    this.onArtifact(updated);
    this.eventBus.emitArtifact(updated);
    return updated;
  }

  getArtifact(artifactId: string): Artifact | undefined {
    const artifact = this.publishedArtifacts.find((item) => item.id === artifactId);
    return artifact ? ({ ...artifact } as Artifact) : undefined;
  }

  getPublishedArtifacts(): Artifact[] {
    return this.publishedArtifacts.map((artifact) => ({ ...artifact }));
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
