import {
  Code2,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Maximize2,
  Minimize2,
  Monitor,
  Terminal,
  X
} from "lucide-react";
import type { ReactNode } from "react";
import { memo, useMemo, useState } from "react";
import { buildRunFlowViewModel } from "../../shared/run-flow-view-model";
import type { RunWorkbenchResource } from "../../shared/run-flow-view-model";
import type { Artifact, Run, RunEvent } from "../../shared/types";
import { ArtifactKindIcon, ArtifactRenderer, getArtifactDownload } from "./artifact-renderers";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

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
      activeRun && !selectedArtifact
        ? buildRunFlowViewModel({
            run: activeRun,
            events,
            artifacts,
            assistantMessages: []
          })
        : undefined,
    [activeRun, artifacts, events, selectedArtifact]
  );
  const latestBrowserResource = [...(flow?.workbenchResources ?? [])].reverse().find((resource) => resource.kind === "browser");
  const selectedDownload = selectedArtifact ? getArtifactDownload(selectedArtifact) : undefined;
  const subtitle = selectedArtifact
    ? `正在预览 ${selectedArtifact.title}`
    : latestBrowserResource
      ? latestBrowserResource.summary ?? latestBrowserResource.title
      : "浏览器操作和沙箱产物会显示在这里";

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
              artifacts={artifacts}
              onOpenArtifact={onOpenArtifact}
              resources={flow?.workbenchResources ?? []}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

const PreviewFrame = memo(function PreviewFrame({ artifact }: { artifact: Artifact }) {
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
});

const WorkbenchHome = memo(function WorkbenchHome({
  artifacts,
  onOpenArtifact,
  resources
}: {
  artifacts: Artifact[];
  onOpenArtifact: (artifactId: string) => void;
  resources: RunWorkbenchResource[];
}) {
  const { codeArtifacts, commandResources, fileArtifacts, latestBrowser } = useMemo(
    () => ({
      latestBrowser: [...resources].reverse().find((resource) => resource.kind === "browser"),
      commandResources: resources.filter((resource) => resource.kind === "command"),
      codeArtifacts: artifacts.filter(isCodeArtifact),
      fileArtifacts: artifacts.filter(isSupportedFileArtifact)
    }),
    [artifacts, resources]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs className="flex min-h-0 flex-1 flex-col" defaultValue="browser">
        <div className="shrink-0 border-b border-border px-3 pt-3">
          <TabsList className="h-9 w-full justify-start gap-1 overflow-x-auto rounded-b-none bg-transparent p-0">
            <TabsTrigger className="shrink-0 px-3 text-xs" value="browser">
              <Globe2 className="size-3.5" />
              浏览器
            </TabsTrigger>
            <TabsTrigger className="shrink-0 px-3 text-xs" value="code">
              <Code2 className="size-3.5" />
              代码
            </TabsTrigger>
            <TabsTrigger className="shrink-0 px-3 text-xs" value="files">
              <FileText className="size-3.5" />
              文件
            </TabsTrigger>
            <TabsTrigger className="shrink-0 px-3 text-xs" value="scripts">
              <Terminal className="size-3.5" />
              执行脚本
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent className="mt-0 min-h-0 flex-1" value="browser">
          <WorkbenchScroll>
            {latestBrowser ? <BrowserSurface resource={latestBrowser} /> : <EmptyTab description="浏览器导航、点击与截图会显示在这里。" />}
          </WorkbenchScroll>
        </TabsContent>

        <TabsContent className="mt-0 min-h-0 flex-1" value="code">
          <WorkbenchScroll>
            {codeArtifacts.length > 0 ? (
              <div className="space-y-2">
                {codeArtifacts.map((artifact) => (
                  <ArtifactRow artifact={artifact} key={artifact.id} onOpenArtifact={onOpenArtifact} />
                ))}
              </div>
            ) : (
              <EmptyTab description="已发布的代码、HTML 和 JSON 产物会显示在这里。" />
            )}
          </WorkbenchScroll>
        </TabsContent>

        <TabsContent className="mt-0 min-h-0 flex-1" value="files">
          <WorkbenchScroll>
            {fileArtifacts.length > 0 ? (
              <div className="space-y-2">
                {fileArtifacts.map((artifact) => (
                  <ArtifactRow artifact={artifact} key={artifact.id} onOpenArtifact={onOpenArtifact} />
                ))}
              </div>
            ) : (
              <EmptyTab description="已发布的 TXT、截图、PPT 和 PDF 产物会显示在这里。" />
            )}
          </WorkbenchScroll>
        </TabsContent>

        <TabsContent className="mt-0 min-h-0 flex-1" value="scripts">
          <WorkbenchScroll>
            {commandResources.length > 0 ? (
              <div className="space-y-2">
                {commandResources.map((resource) => (
                  <ScriptRow key={resource.id} resource={resource} />
                ))}
              </div>
            ) : (
              <EmptyTab description="所有在沙箱中执行的 Shell、Node.js 和 Python 脚本会显示在这里。" />
            )}
          </WorkbenchScroll>
        </TabsContent>
      </Tabs>
    </div>
  );
});

const BrowserSurface = memo(function BrowserSurface({ resource }: { resource: RunWorkbenchResource }) {
  return (
    <div className="rounded-lg bg-background/45 p-3 shadow-[var(--shadow-soft)]">
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
    </div>
  );
});

function WorkbenchScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4">{children}</div>
    </ScrollArea>
  );
}

const ArtifactRow = memo(function ArtifactRow({ artifact, onOpenArtifact }: { artifact: Artifact; onOpenArtifact: (artifactId: string) => void }) {
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
});

function EmptyTab({ description }: { description: string }) {
  return (
    <div className="grid min-h-72 place-items-center text-center">
      <div>
        <Monitor className="mx-auto mb-3 size-10 text-muted-foreground" />
        <h3 className="text-sm font-semibold">等待沙箱活动</h3>
        <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

const ScriptRow = memo(function ScriptRow({ resource }: { resource: RunWorkbenchResource }) {
  if (resource.kind !== "command") {
    return null;
  }

  const statusLabel = resource.status === "completed" ? "完成" : resource.status === "failed" ? "失败" : "执行中";

  return (
    <article className="rounded-lg bg-background/45 p-3 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{resource.title}</span>
        </div>
        <Badge variant={resource.status === "failed" ? "warning" : resource.status === "completed" ? "success" : "outline"}>{statusLabel}</Badge>
      </div>
      <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-code px-3 py-2 text-xs leading-5 text-code-foreground">
        <code className="whitespace-pre-wrap break-all">{resource.command ?? "未记录脚本内容"}</code>
      </pre>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {resource.exitCode !== undefined && resource.exitCode !== null ? <span>退出码：{resource.exitCode}</span> : null}
        {resource.summary ? <span className="break-words">{resource.summary}</span> : null}
      </div>
    </article>
  );
});

function isCodeArtifact(artifact: Artifact): boolean {
  return artifact.kind === "code" || artifact.kind === "html" || artifact.kind === "json";
}

function isSupportedFileArtifact(artifact: Artifact): boolean {
  if (artifact.kind === "image" || artifact.kind === "pdf" || artifact.kind === "slides") {
    return true;
  }

  if (artifact.kind === "text") {
    return hasExtension(artifact.title, ["txt"]);
  }

  if (artifact.kind === "file") {
    return isSupportedFilePath(artifact.fileName) || isSupportedFileMimeType(artifact.mimeType);
  }

  return false;
}

function isSupportedFilePath(path: string): boolean {
  return hasExtension(path, ["bmp", "gif", "jpeg", "jpg", "pdf", "png", "ppt", "pptx", "svg", "txt", "webp"]);
}

function isSupportedFileMimeType(mimeType: string): boolean {
  return (
    mimeType === "application/pdf" ||
    mimeType === "text/plain" ||
    mimeType.startsWith("image/") ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  );
}

function hasExtension(fileName: string, extensions: string[]): boolean {
  const extension = fileName.split(/[?#]/, 1)[0]?.split(".").at(-1)?.toLowerCase();
  return Boolean(extension && extensions.includes(extension));
}
