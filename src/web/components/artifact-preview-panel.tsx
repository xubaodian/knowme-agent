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
import { memo, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildRunFlowViewModel } from "../../shared/run-flow-view-model";
import type { RunWorkbenchResource } from "../../shared/run-flow-view-model";
import type { Artifact, Run, RunEvent } from "../../shared/types";
import { getRunWorkspaceFile, getRunWorkspaceFileDownloadUrl, listRunWorkspaceFiles } from "../api/client";
import type { WorkspaceFile } from "../api/client";
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
  const [selectedWorkspaceArtifact, setSelectedWorkspaceArtifact] = useState<Artifact>();
  const [workspaceFileError, setWorkspaceFileError] = useState<string>();
  const workspaceFilesQuery = useQuery({
    queryKey: ["run-workspace-files", activeRun?.id, activeRun?.status],
    queryFn: () => listRunWorkspaceFiles(activeRun!.id),
    enabled: Boolean(activeRun),
    refetchInterval: activeRun?.status === "running" ? 1500 : false
  });
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
  const previewArtifact = selectedArtifact ?? selectedWorkspaceArtifact;
  const selectedDownload = previewArtifact ? getArtifactDownload(previewArtifact) : undefined;
  const subtitle = previewArtifact ? previewArtifact.title : "预览、文档、代码与执行记录";

  useEffect(() => {
    setSelectedWorkspaceArtifact(undefined);
    setWorkspaceFileError(undefined);
  }, [activeRun?.id]);

  async function openWorkspaceFile(file: WorkspaceFile) {
    if (!activeRun) return;

    setWorkspaceFileError(undefined);

    try {
      const content = await getRunWorkspaceFile(activeRun.id, file.path);
      setSelectedWorkspaceArtifact(toWorkspaceArtifact(activeRun, content.path, content.content));
    } catch (error) {
      setWorkspaceFileError(error instanceof Error ? error.message : "文件读取失败");
    }
  }

  async function downloadWorkspaceFile(file: WorkspaceFile) {
    if (!activeRun) return;
    const anchor = document.createElement("a");
    anchor.download = fileName(file.path);
    anchor.href = getRunWorkspaceFileDownloadUrl(activeRun.id, file.path);
    anchor.click();
  }

  function closePreview() {
    if (selectedWorkspaceArtifact) {
      setSelectedWorkspaceArtifact(undefined);
      return;
    }

    onCloseArtifact();
  }

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
          {previewArtifact ? (
            <Button onClick={closePreview} size="icon" type="button" variant="ghost" title="返回工作区">
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-3.5 pb-3.5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-preview-surface shadow-[var(--shadow-soft)]">
          {previewArtifact ? (
            <PreviewFrame artifact={previewArtifact} />
          ) : (
            <WorkspaceHome
              artifacts={artifacts}
              onDownloadWorkspaceFile={downloadWorkspaceFile}
              onOpenArtifact={onOpenArtifact}
              onOpenWorkspaceFile={openWorkspaceFile}
              resources={flow?.workbenchResources ?? []}
              workspaceFiles={workspaceFilesQuery.data ?? []}
              workspaceFileError={workspaceFileError}
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
  onDownloadWorkspaceFile,
  onOpenArtifact,
  onOpenWorkspaceFile,
  resources,
  workspaceFiles,
  workspaceFileError
}: {
  artifacts: Artifact[];
  onDownloadWorkspaceFile: (file: WorkspaceFile) => void;
  onOpenArtifact: (artifactId: string) => void;
  onOpenWorkspaceFile: (file: WorkspaceFile) => void;
  resources: RunWorkbenchResource[];
  workspaceFiles: WorkspaceFile[];
  workspaceFileError?: string;
}) {
  const groups = useMemo(() => buildWorkspaceGroups(artifacts, resources, workspaceFiles), [artifacts, resources, workspaceFiles]);

  return (
    <Tabs className="flex min-h-0 flex-1 flex-col" defaultValue="preview">
      <div className="shrink-0 px-3 pt-3">
        <TabsList className="h-10 w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1">
          <WorkspaceTab icon={<Globe2 className="size-3.5" />} label="预览" value="preview" />
          <WorkspaceTab count={groups.documents.artifacts.length + groups.documents.resources.length} icon={<FileText className="size-3.5" />} label="文档" value="documents" />
          <WorkspaceTab count={groups.code.artifacts.length + groups.code.resources.length} icon={<Code2 className="size-3.5" />} label="代码" value="code" />
          <WorkspaceTab count={groups.files.artifacts.length + groups.files.resources.length} icon={<FolderOpen className="size-3.5" />} label="文件" value="files" />
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
        <WorkspaceItemGroup group={groups.documents} empty="报告、Markdown 与表格会显示在这里。" onDownloadWorkspaceFile={onDownloadWorkspaceFile} onOpenArtifact={onOpenArtifact} onOpenWorkspaceFile={onOpenWorkspaceFile} />
      </TabsContent>
      <TabsContent className="mt-0 min-h-0 flex-1" value="code">
        <WorkspaceItemGroup group={groups.code} empty="生成的代码、HTML 和 JSON 会显示在这里。" onDownloadWorkspaceFile={onDownloadWorkspaceFile} onOpenArtifact={onOpenArtifact} onOpenWorkspaceFile={onOpenWorkspaceFile} />
      </TabsContent>
      <TabsContent className="mt-0 min-h-0 flex-1" value="files">
        <WorkspaceItemGroup group={groups.files} empty="图片及其他输出文件会显示在这里。" onDownloadWorkspaceFile={onDownloadWorkspaceFile} onOpenArtifact={onOpenArtifact} onOpenWorkspaceFile={onOpenWorkspaceFile} />
      </TabsContent>
      {workspaceFileError ? <p className="shrink-0 px-4 pb-3 text-xs text-destructive">{workspaceFileError}</p> : null}
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

function WorkspaceItemGroup({
  empty,
  group,
  onDownloadWorkspaceFile,
  onOpenArtifact,
  onOpenWorkspaceFile
}: {
  empty: string;
  group: WorkspaceGroup;
  onDownloadWorkspaceFile: (file: WorkspaceFile) => void;
  onOpenArtifact: (artifactId: string) => void;
  onOpenWorkspaceFile: (file: WorkspaceFile) => void;
}) {
  const hasItems = group.artifacts.length > 0 || group.resources.length > 0;

  return (
    <WorkspaceScroll>
      {hasItems ? (
        <div className="space-y-2">
          {group.artifacts.map((artifact) => <ArtifactRow artifact={artifact} key={artifact.id} onOpenArtifact={onOpenArtifact} />)}
          {group.resources.map((file) => <WorkspaceFileRow file={file} key={file.path} onDownload={onDownloadWorkspaceFile} onOpen={onOpenWorkspaceFile} />)}
        </div>
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

const WorkspaceFileRow = memo(function WorkspaceFileRow({
  file,
  onDownload,
  onOpen
}: {
  file: WorkspaceFile;
  onDownload: (file: WorkspaceFile) => void;
  onOpen: (file: WorkspaceFile) => void;
}) {
  const canOpen = canPreviewWorkspaceFile(file.path);
  const icon = isCodePath(file.path) ? <Code2 className="size-4" /> : <FileText className="size-4" />;
  const details = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background/80 text-foreground shadow-sm">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{fileName(file.path)}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{workspaceFileKind(file.path)} · ready</span>
      </span>
    </>
  );

  return (
    <div className="group flex items-center justify-between gap-3 rounded-xl bg-muted/28 p-3 transition-colors hover:bg-muted/55">
      {canOpen ? (
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(file)} type="button">{details}</button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{details}</div>
      )}
      <button className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-primary" onClick={() => onDownload(file)} title={`下载 ${fileName(file.path)}`} type="button">
        <Download className="size-4" />
      </button>
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

type WorkspaceGroup = {
  artifacts: Artifact[];
  resources: WorkspaceFile[];
};

function buildWorkspaceGroups(artifacts: Artifact[], resources: RunWorkbenchResource[], workspaceFiles: WorkspaceFile[]) {
  const visibleArtifacts = artifacts.filter((artifact) => artifact.display.mode !== "hidden");
  const publishedPaths = new Set(visibleArtifacts.map(readArtifactSourcePath).filter((path): path is string => Boolean(path)));
  const files = workspaceFiles.filter((file) => !publishedPaths.has(file.path));

  return {
    latestBrowser: [...resources].reverse().find((resource) => resource.kind === "browser"),
    commands: resources.filter((resource) => resource.kind === "command"),
    documents: {
      artifacts: visibleArtifacts.filter(isDocumentArtifact),
      resources: files.filter((file) => isDocumentPath(file.path))
    } satisfies WorkspaceGroup,
    code: {
      artifacts: visibleArtifacts.filter(isCodeArtifact),
      resources: files.filter((file) => isCodePath(file.path))
    } satisfies WorkspaceGroup,
    files: {
      artifacts: visibleArtifacts.filter(isFileArtifact),
      resources: files.filter((file) => !isDocumentPath(file.path) && !isCodePath(file.path))
    } satisfies WorkspaceGroup
  };
}

function readArtifactSourcePath(artifact: Artifact): string | undefined {
  const path = artifact.metadata?.sourcePath;
  return typeof path === "string" ? path : undefined;
}

function isDocumentPath(path: string): boolean {
  return hasExtension(path, ["md", "mdx", "txt", "csv", "pdf", "ppt", "pptx"]);
}

function isCodePath(path: string): boolean {
  return hasExtension(path, ["css", "html", "htm", "js", "jsx", "json", "mjs", "cjs", "py", "sh", "sql", "ts", "tsx", "xml", "yaml", "yml"]);
}

function hasExtension(path: string, extensions: string[]): boolean {
  const extension = path.split(/[?#]/, 1)[0]?.split(".").at(-1)?.toLowerCase();
  return Boolean(extension && extensions.includes(extension));
}

function fileName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function canPreviewWorkspaceFile(path: string): boolean {
  return hasExtension(path, ["md", "mdx", "txt", "csv"]) || isCodePath(path);
}

function workspaceFileKind(path: string): string {
  if (hasExtension(path, ["md", "mdx"])) return "markdown";
  if (hasExtension(path, ["txt", "csv"])) return "text";
  return isCodePath(path) ? "code" : "file";
}

function toWorkspaceArtifact(run: Run, path: string, content: string): Artifact {
  const now = new Date().toISOString();
  const base = {
    id: `workspace:${run.id}:${path}`,
    runId: run.id,
    chatId: run.chatId,
    title: fileName(path),
    status: "ready" as const,
    createdAt: now,
    updatedAt: now,
    version: 1,
    display: { mode: "preview" as const },
    metadata: { sourcePath: path }
  };

  if (hasExtension(path, ["md", "mdx"])) {
    return { ...base, kind: "markdown", content };
  }

  if (isCodePath(path)) {
    return { ...base, kind: "code", language: path.split(".").at(-1) ?? "text", content };
  }

  return { ...base, kind: "text", content };
}
