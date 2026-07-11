import {
  Code2,
  Download,
  ExternalLink,
  FileOutput,
  FileText,
  FolderOpen,
  Globe2,
  Maximize2,
  Minimize2,
  PackageOpen,
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

export function ArtifactPreviewPanel({
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
  const selectedDownload = selectedArtifact ? getArtifactDownload(selectedArtifact) : undefined;
  const subtitle = selectedArtifact ? selectedArtifact.title : "预览、文档、代码与执行记录";

  return (
    <aside
      className={`flex h-full min-h-0 flex-col bg-preview ${
        isExpanded ? "fixed inset-4 z-50 overflow-hidden rounded-3xl shadow-[var(--shadow-panel)]" : ""
      }`}
    >
      <header className="flex h-16 shrink-0 items-center justify-between px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileOutput className="size-4" />
            </span>
            <h2 className="truncate text-[15px] font-semibold">任务工作区</h2>
          </div>
          <p className="mt-0.5 truncate pl-10 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          {selectedDownload ? (
            <Button asChild size="icon" variant="ghost" title="在新窗口打开">
              <a href={selectedDownload.href} rel="noreferrer" target="_blank">
                <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : null}
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
            <Button onClick={onCloseArtifact} size="icon" type="button" variant="ghost" title="返回工作区">
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-3.5 pb-3.5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-preview-surface shadow-[var(--shadow-soft)]">
          {selectedArtifact ? (
            <PreviewFrame artifact={selectedArtifact} />
          ) : (
            <WorkspaceHome
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
      <div className="flex h-14 shrink-0 items-center justify-between bg-muted/25 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-background/80">
            <ArtifactKindIcon artifact={artifact} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{artifact.title}</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">版本 {artifact.version} · {artifact.status}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {download ? (
            <a
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              download={download.fileName}
              href={download.href}
              title={`下载 ${download.fileName}`}
            >
              <Download className="size-3.5" />
              下载
            </a>
          ) : null}
          <Badge variant="outline">{artifact.kind}</Badge>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-background/30">
        <ArtifactRenderer artifact={artifact} />
      </div>
    </div>
  );
});

const WorkspaceHome = memo(function WorkspaceHome({
  artifacts,
  onOpenArtifact,
  resources
}: {
  artifacts: Artifact[];
  onOpenArtifact: (artifactId: string) => void;
  resources: RunWorkbenchResource[];
}) {
  const groups = useMemo(
    () => ({
      latestBrowser: [...resources].reverse().find((resource) => resource.kind === "browser"),
      commands: resources.filter((resource) => resource.kind === "command"),
      documents: artifacts.filter(isDocumentArtifact),
      code: artifacts.filter(isCodeArtifact),
      files: artifacts.filter(isFileArtifact)
    }),
    [artifacts, resources]
  );

  return (
    <Tabs className="flex min-h-0 flex-1 flex-col" defaultValue="preview">
      <div className="shrink-0 px-3 pt-3">
        <TabsList className="h-10 w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1">
          <WorkspaceTab icon={<Globe2 className="size-3.5" />} label="预览" value="preview" />
          <WorkspaceTab count={groups.documents.length} icon={<FileText className="size-3.5" />} label="文档" value="documents" />
          <WorkspaceTab count={groups.code.length} icon={<Code2 className="size-3.5" />} label="代码" value="code" />
          <WorkspaceTab count={groups.files.length} icon={<FolderOpen className="size-3.5" />} label="文件" value="files" />
          <WorkspaceTab count={groups.commands.length} icon={<Terminal className="size-3.5" />} label="Shell" value="shell" />
        </TabsList>
      </div>

      <TabsContent className="mt-0 min-h-0 flex-1" value="preview">
        <WorkspaceScroll>
          {groups.latestBrowser ? (
            <BrowserSurface resource={groups.latestBrowser} />
          ) : (
            <EmptyState icon={<Globe2 className="size-5" />} title="暂无预览" description="页面预览和浏览器截图会显示在这里。" />
          )}
        </WorkspaceScroll>
      </TabsContent>
      <TabsContent className="mt-0 min-h-0 flex-1" value="documents">
        <ArtifactGroup artifacts={groups.documents} empty="报告、Markdown、表格与演示文档会显示在这里。" onOpenArtifact={onOpenArtifact} />
      </TabsContent>
      <TabsContent className="mt-0 min-h-0 flex-1" value="code">
        <ArtifactGroup artifacts={groups.code} empty="生成的代码和 JSON 会显示在这里。" onOpenArtifact={onOpenArtifact} />
      </TabsContent>
      <TabsContent className="mt-0 min-h-0 flex-1" value="files">
        <ArtifactGroup artifacts={groups.files} empty="图片及其他输出文件会显示在这里。" onOpenArtifact={onOpenArtifact} />
      </TabsContent>
      <TabsContent className="mt-0 min-h-0 flex-1" value="shell">
        <WorkspaceScroll>
          {groups.commands.length > 0 ? (
            <div className="space-y-2.5">
              {groups.commands.map((resource) => <ScriptRow key={resource.id} resource={resource} />)}
            </div>
          ) : (
            <EmptyState icon={<Terminal className="size-5" />} title="暂无执行记录" description="Shell、Node.js 和 Python 脚本会显示在这里。" />
          )}
        </WorkspaceScroll>
      </TabsContent>
    </Tabs>
  );
});

function WorkspaceTab({ count, icon, label, value }: { count?: number; icon: ReactNode; label: string; value: string }) {
  return (
    <TabsTrigger className="shrink-0 gap-1.5 rounded-lg px-2.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm" value={value}>
      {icon}
      {label}
      {count ? <span className="text-[10px] text-muted-foreground">{count}</span> : null}
    </TabsTrigger>
  );
}

function ArtifactGroup({ artifacts, empty, onOpenArtifact }: { artifacts: Artifact[]; empty: string; onOpenArtifact: (artifactId: string) => void }) {
  return (
    <WorkspaceScroll>
      {artifacts.length > 0 ? (
        <div className="space-y-2">{artifacts.map((artifact) => <ArtifactRow artifact={artifact} key={artifact.id} onOpenArtifact={onOpenArtifact} />)}</div>
      ) : (
        <EmptyState icon={<PackageOpen className="size-5" />} title="暂无内容" description={empty} />
      )}
    </WorkspaceScroll>
  );
}

const BrowserSurface = memo(function BrowserSurface({ resource }: { resource: RunWorkbenchResource }) {
  return (
    <div className="overflow-hidden rounded-xl bg-muted/30">
      {resource.kind === "browser" && resource.screenshotUrl ? (
        <img alt={resource.title} className="max-h-[28rem] w-full object-contain" src={resource.screenshotUrl} />
      ) : (
        <div className="grid min-h-56 place-items-center p-6 text-center">
          <div>
            <Globe2 className="mx-auto mb-3 size-8 text-muted-foreground" />
            <h4 className="text-sm font-semibold">{resource.title}</h4>
            {resource.kind === "browser" ? <p className="mt-1 break-all text-xs text-muted-foreground">{resource.url}</p> : null}
          </div>
        </div>
      )}
      {resource.summary ? <p className="px-3.5 py-3 text-xs leading-5 text-muted-foreground">{resource.summary}</p> : null}
    </div>
  );
});

function WorkspaceScroll({ children }: { children: ReactNode }) {
  return <ScrollArea className="h-full"><div className="p-3.5">{children}</div></ScrollArea>;
}

const ArtifactRow = memo(function ArtifactRow({ artifact, onOpenArtifact }: { artifact: Artifact; onOpenArtifact: (artifactId: string) => void }) {
  const download = getArtifactDownload(artifact);

  return (
    <div className="group flex items-center justify-between gap-3 rounded-xl bg-muted/28 p-3 transition-colors hover:bg-muted/55">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpenArtifact(artifact.id)} type="button">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background/80 text-foreground shadow-sm"><ArtifactKindIcon artifact={artifact} /></span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{artifact.title}</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{artifact.kind} · {artifact.status}</span>
        </span>
      </button>
      {download ? (
        <a className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-primary" download={download.fileName} href={download.href} title={`下载 ${download.fileName}`}>
          <Download className="size-4" />
        </a>
      ) : null}
    </div>
  );
});

function EmptyState({ description, icon, title }: { description: string; icon: ReactNode; title: string }) {
  return (
    <div className="grid min-h-72 place-items-center px-6 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted/55 text-muted-foreground">{icon}</span>
        <h3 className="mt-4 text-sm font-semibold">{title}</h3>
        <p className="mt-1.5 max-w-xs text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

const ScriptRow = memo(function ScriptRow({ resource }: { resource: RunWorkbenchResource }) {
  if (resource.kind !== "command") return null;
  const statusLabel = resource.status === "completed" ? "完成" : resource.status === "failed" ? "失败" : "执行中";

  return (
    <article className="rounded-xl bg-muted/28 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2"><Terminal className="size-4 shrink-0 text-muted-foreground" /><span className="truncate text-sm font-medium">{resource.title}</span></div>
        <Badge variant={resource.status === "failed" ? "warning" : resource.status === "completed" ? "success" : "outline"}>{statusLabel}</Badge>
      </div>
      <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-code px-3 py-2.5 text-xs leading-5 text-code-foreground"><code className="whitespace-pre-wrap break-all">{resource.command ?? "未记录脚本内容"}</code></pre>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {resource.exitCode !== undefined && resource.exitCode !== null ? <span>退出码：{resource.exitCode}</span> : null}
        {resource.summary ? <span className="break-words">{resource.summary}</span> : null}
      </div>
    </article>
  );
});

function isDocumentArtifact(artifact: Artifact): boolean {
  return artifact.kind === "markdown" || artifact.kind === "text" || artifact.kind === "html" || artifact.kind === "pdf" || artifact.kind === "slides" || artifact.kind === "table" || artifact.kind === "chart";
}

function isCodeArtifact(artifact: Artifact): boolean {
  return artifact.kind === "code" || artifact.kind === "json";
}

function isFileArtifact(artifact: Artifact): boolean {
  return artifact.kind === "image" || artifact.kind === "file";
}
