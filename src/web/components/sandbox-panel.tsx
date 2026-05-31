import { ExternalLink, Maximize2, Monitor, MousePointer2, Square, X } from "lucide-react";
import type { Artifact, Run, RunEvent } from "../../shared/types";
import { ArtifactKindIcon, ArtifactRenderer } from "./artifact-renderers";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

export function SandboxPanel({
  activeRun,
  events,
  selectedArtifact,
  onCloseArtifact
}: {
  activeRun?: Run;
  events: RunEvent[];
  selectedArtifact?: Artifact;
  onCloseArtifact: () => void;
}) {
  const activeTool = [...events].reverse().find((event) => event.type.startsWith("tool."));

  return (
    <aside className="flex h-full min-h-0 flex-col bg-sandbox backdrop-blur-xl">
      <header className="flex h-16 shrink-0 items-center justify-between px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Monitor className="size-4 text-muted-foreground" />
            <h2 className="truncate text-base font-semibold">knowme-agent 的电脑</h2>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {selectedArtifact ? `正在预览 ${selectedArtifact.title}` : activeTool?.detail ?? "等待 Agent 使用工具或打开预览"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" type="button" variant="ghost" title="Open">
            <ExternalLink className="size-4" />
          </Button>
          <Button size="icon" type="button" variant="ghost" title="全屏">
            <Maximize2 className="size-4" />
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
          {selectedArtifact ? <PreviewFrame artifact={selectedArtifact} /> : <SandboxIdle activeRun={activeRun} events={events} />}
        </div>

        <div className="glass-panel mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{activeRun?.status === "running" ? "Agent 正在执行" : "可接管沙箱"}</p>
            <p className="truncate text-xs text-muted-foreground">浏览器登录、文件编辑、长任务确认等操作会出现在这里。</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" type="button" variant="outline">
              <MousePointer2 className="size-4" />
              接管
            </Button>
            <Button size="sm" type="button" variant="ghost">
              <Square className="size-4" />
              停止
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function PreviewFrame({ artifact }: { artifact: Artifact }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between bg-card/65 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <ArtifactKindIcon artifact={artifact} />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{artifact.title}</h3>
            <p className="text-xs text-muted-foreground">v{artifact.version} · {artifact.status}</p>
          </div>
        </div>
        <Badge variant="outline">{artifact.kind}</Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ArtifactRenderer artifact={artifact} />
      </div>
    </div>
  );
}

function SandboxIdle({ activeRun, events }: { activeRun?: Run; events: RunEvent[] }) {
  const recentEvents = events.slice(-6).reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="bg-card/45 px-4 py-3">
        <h3 className="text-sm font-semibold">Sandbox Console</h3>
        <p className="mt-1 text-xs text-muted-foreground">{activeRun ? activeRun.id : "No active run"}</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {recentEvents.length === 0 ? (
            <div className="grid min-h-72 place-items-center text-center">
              <div>
                <Monitor className="mx-auto mb-3 size-10 text-muted-foreground" />
                <h3 className="text-sm font-semibold">等待沙箱活动</h3>
                <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
                  当 Agent 打开浏览器、编辑文件、生成 HTML 或需要用户接管登录时，这里会展示对应画面和操作按钮。
                </p>
              </div>
            </div>
          ) : (
            recentEvents.map((event) => (
              <div className="rounded-md bg-background/45 px-3 py-2 shadow-[var(--shadow-soft)]" key={event.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">{event.title}</span>
                  <Badge variant="outline">{event.type}</Badge>
                </div>
                {event.detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.detail}</p> : null}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
