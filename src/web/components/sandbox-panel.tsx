import {
  Code2,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Maximize2,
  Minimize2,
  Monitor,
  Play,
  Search,
  Square,
  StickyNote,
  Terminal,
  X
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { buildRunFlowViewModel } from "../../shared/run-flow-view-model";
import type { RunWorkbenchResource } from "../../shared/run-flow-view-model";
import type { Artifact, Run, RunEvent } from "../../shared/types";
import { ArtifactKindIcon, ArtifactRenderer, getArtifactDownload } from "./artifact-renderers";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

export function SandboxPanel({
  activeRun,
  artifacts,
  events,
  selectedArtifact,
  onCloseArtifact,
  onOpenArtifact
}: {
  activeRun?: Run;
  artifacts: Artifact[];
  events: RunEvent[];
  selectedArtifact?: Artifact;
  onCloseArtifact: () => void;
  onOpenArtifact: (artifactId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const flow = useMemo(
    () =>
      activeRun
        ? buildRunFlowViewModel({
            run: activeRun,
            events,
            artifacts,
            assistantMessages: []
          })
        : undefined,
    [activeRun, artifacts, events]
  );
  const latestResource = flow?.workbenchResources.at(-1);
  const pendingApproval = [...events]
    .reverse()
    .find((event) => event.type === "approval.requested" && event.status !== "done" && event.status !== "completed");
  const selectedDownload = selectedArtifact ? getArtifactDownload(selectedArtifact) : undefined;
  const subtitle = selectedArtifact
    ? `正在预览 ${selectedArtifact.title}`
    : latestResource
      ? latestResource.summary ?? latestResource.title
      : "文件、浏览器、资料整理和确认操作会出现在这里";

  return (
    <aside
      className={`flex h-full min-h-0 flex-col bg-sandbox backdrop-blur-xl ${
        isExpanded ? "fixed inset-4 z-50 rounded-xl shadow-[0_30px_90px_rgba(15,23,42,0.24)]" : ""
      }`}
    >
      <header className="flex h-16 shrink-0 items-center justify-between px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Monitor className="size-4 text-muted-foreground" />
            <h2 className="truncate text-base font-semibold">knowme-agent 的电脑</h2>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          {selectedDownload ? (
            <Button asChild size="icon" variant="ghost" title="Open">
              <a href={selectedDownload.href} rel="noreferrer" target="_blank">
                <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : (
            <Button disabled size="icon" type="button" variant="ghost" title="Open">
              <ExternalLink className="size-4" />
            </Button>
          )}
          <Button
            aria-pressed={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
            size="icon"
            type="button"
            variant="ghost"
            title={isExpanded ? "还原" : "放大"}
          >
            {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          {selectedArtifact ? (
            <Button onClick={onCloseArtifact} size="icon" type="button" variant="ghost" title="Close preview">
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-sandbox-surface">
          {selectedArtifact ? (
            <PreviewFrame artifact={selectedArtifact} />
          ) : (
            <WorkbenchHome
              activeRun={activeRun}
              artifacts={artifacts}
              onOpenArtifact={onOpenArtifact}
              resources={flow?.workbenchResources ?? []}
            />
          )}
        </div>

        <div className="glass-panel mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{pendingApproval ? "等待用户确认" : "沙箱可直接操作"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {pendingApproval
                ? pendingApproval.detail ?? "完成必要操作后继续执行。"
                : "浏览器、文件预览和资料面板可直接交互。"}
            </p>
          </div>
          {pendingApproval ? (
            <div className="flex items-center gap-2">
              <Button size="sm" type="button">
                <Play className="size-4" />
                继续执行
              </Button>
              <Button size="sm" type="button" variant="ghost">
                <Square className="size-4" />
                停止
              </Button>
            </div>
          ) : activeRun?.status === "running" ? (
            <Button size="sm" type="button" variant="ghost">
              <Square className="size-4" />
              停止
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function PreviewFrame({ artifact }: { artifact: Artifact }) {
  const download = getArtifactDownload(artifact);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between bg-card/65 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <ArtifactKindIcon artifact={artifact} />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{artifact.title}</h3>
            <p className="text-xs text-muted-foreground">
              v{artifact.version} · {artifact.status}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {download ? (
            <a
              className="inline-flex size-8 items-center justify-center rounded-md bg-muted/55 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              download={download.fileName}
              href={download.href}
              title={`下载 ${download.fileName}`}
            >
              <Download className="size-4" />
            </a>
          ) : null}
          <Badge variant="outline">{artifact.kind}</Badge>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ArtifactRenderer artifact={artifact} />
      </div>
    </div>
  );
}

function WorkbenchHome({
  activeRun,
  artifacts,
  onOpenArtifact,
  resources
}: {
  activeRun?: Run;
  artifacts: Artifact[];
  onOpenArtifact: (artifactId: string) => void;
  resources: RunWorkbenchResource[];
}) {
  const latestBrowser = [...resources].reverse().find((resource) => resource.kind === "browser");
  const fileResources = resources.filter((resource) => resource.kind === "file" || resource.kind === "file_list");
  const noteResources = resources.filter((resource) => resource.kind === "note");
  const commandResources = resources.filter((resource) => resource.kind === "command").slice(-4).reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="bg-card/45 px-4 py-3">
        <h3 className="text-sm font-semibold">Sandbox Workbench</h3>
        <p className="mt-1 text-xs text-muted-foreground">{activeRun ? activeRun.id : "No active run"}</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {!latestBrowser && fileResources.length === 0 && noteResources.length === 0 && artifacts.length === 0 ? (
            <EmptyWorkbench />
          ) : null}

          {latestBrowser ? <BrowserSurface resource={latestBrowser} /> : null}

          {fileResources.length > 0 || artifacts.length > 0 ? (
            <WorkbenchSection icon={<FileText className="size-4" />} title="文件与产物">
              <div className="space-y-2">
                {fileResources.slice(-6).reverse().map((resource) => (
                  <ResourceRow key={resource.id} resource={resource} />
                ))}
                {artifacts.map((artifact) => (
                  <ArtifactRow artifact={artifact} key={artifact.id} onOpenArtifact={onOpenArtifact} />
                ))}
              </div>
            </WorkbenchSection>
          ) : null}

          {noteResources.length > 0 ? (
            <WorkbenchSection icon={<Search className="size-4" />} title="资料整理">
              <div className="space-y-2">
                {noteResources.slice(-6).reverse().map((resource) => (
                  <ResourceRow key={resource.id} resource={resource} />
                ))}
              </div>
            </WorkbenchSection>
          ) : null}

          {commandResources.length > 0 ? (
            <WorkbenchSection icon={<Terminal className="size-4" />} title="执行记录">
              <div className="space-y-2">
                {commandResources.map((resource) => (
                  <ResourceRow key={resource.id} resource={resource} />
                ))}
              </div>
            </WorkbenchSection>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function BrowserSurface({ resource }: { resource: RunWorkbenchResource }) {
  return (
    <WorkbenchSection icon={<Globe2 className="size-4" />} title="浏览器">
      <div className="overflow-hidden rounded-md bg-background/55">
        {resource.kind === "browser" && resource.screenshotUrl ? (
          <img alt={resource.title} className="max-h-72 w-full object-contain" src={resource.screenshotUrl} />
        ) : (
          <div className="grid min-h-48 place-items-center bg-muted/30 p-5 text-center">
            <div>
              <Globe2 className="mx-auto mb-3 size-10 text-muted-foreground" />
              <h4 className="text-sm font-semibold">{resource.title}</h4>
              {resource.kind === "browser" ? <p className="mt-1 break-all text-xs text-muted-foreground">{resource.url}</p> : null}
            </div>
          </div>
        )}
      </div>
      {resource.summary ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{resource.summary}</p> : null}
    </WorkbenchSection>
  );
}

function WorkbenchSection({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="rounded-lg bg-background/45 p-3 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function ResourceRow({ resource }: { resource: RunWorkbenchResource }) {
  const icon =
    resource.kind === "command" ? (
      <Terminal className="size-4" />
    ) : resource.kind === "note" ? (
      <StickyNote className="size-4" />
    ) : resource.kind === "browser" ? (
      <Globe2 className="size-4" />
    ) : (
      <Code2 className="size-4" />
    );

  return (
    <div className="rounded-md bg-card/50 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="truncate text-sm font-medium">{resource.title}</span>
        </div>
        <Badge variant={resource.status === "failed" ? "warning" : "outline"}>{resource.kind}</Badge>
      </div>
      {resource.kind === "file_list" && resource.files.length > 0 ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{resource.files.slice(0, 5).join(", ")}</p>
      ) : null}
      {resource.summary ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{resource.summary}</p> : null}
    </div>
  );
}

function ArtifactRow({ artifact, onOpenArtifact }: { artifact: Artifact; onOpenArtifact: (artifactId: string) => void }) {
  const download = getArtifactDownload(artifact);

  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-card/50 px-3 py-2 transition-colors hover:bg-muted/70">
      <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onOpenArtifact(artifact.id)} type="button">
        <ArtifactKindIcon artifact={artifact} />
        <span className="truncate text-sm font-medium">{artifact.title}</span>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        {download ? (
          <a
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
            download={download.fileName}
            href={download.href}
            title={`下载 ${download.fileName}`}
          >
            <Download className="size-4" />
          </a>
        ) : null}
        <Badge variant="outline">{artifact.kind}</Badge>
      </div>
    </div>
  );
}

function EmptyWorkbench() {
  return (
    <div className="grid min-h-72 place-items-center text-center">
      <div>
        <Monitor className="mx-auto mb-3 size-10 text-muted-foreground" />
        <h3 className="text-sm font-semibold">等待沙箱活动</h3>
        <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
          文件、浏览器、资料整理、截图和确认操作会集中在这里。普通回复和完成日志不会进入工作台。
        </p>
      </div>
    </div>
  );
}
