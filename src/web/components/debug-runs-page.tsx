import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Box,
  Braces,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  FileInput,
  FileOutput,
  RefreshCcw,
  TerminalSquare
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RunTraceNode, RunTraceSummary } from "../../shared/types";
import { getDebugRunTrace, getDebugTraceNodePayload, listDebugRuns } from "../api/client";
import type { ThemeMode } from "../lib/theme";
import { Button } from "./ui/button";

type DebugRunsPageProps = {
  theme: ThemeMode;
};

type PayloadKind = "input" | "output" | "error";

export function DebugRunsPage({ theme }: DebugRunsPageProps) {
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();

  const runsQuery = useQuery({
    queryKey: ["debug-runs"],
    queryFn: listDebugRuns,
    refetchInterval: 4000
  });
  const runs = runsQuery.data ?? [];

  useEffect(() => {
    if (!selectedRunId && runs.length > 0) {
      setSelectedRunId(runs[0].runId);
    }
  }, [runs, selectedRunId]);

  const traceQuery = useQuery({
    queryKey: ["debug-run-trace", selectedRunId],
    queryFn: () => getDebugRunTrace(selectedRunId ?? ""),
    enabled: Boolean(selectedRunId),
    refetchInterval: (query) => (query.state.data?.run.status === "running" ? 2000 : false)
  });
  const trace = traceQuery.data;
  const nodes = trace?.nodes ?? [];
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? nodes[0], [nodes, selectedNodeId]);

  useEffect(() => {
    if (nodes.length === 0) {
      setSelectedNodeId(undefined);
      return;
    }

    if (!selectedNodeId || !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(nodes[0].id);
    }
  }, [nodes, selectedNodeId]);

  const inputPayload = useTracePayload(selectedRunId, selectedNode, "input");
  const outputPayload = useTracePayload(selectedRunId, selectedNode, "output");
  const errorPayload = useTracePayload(selectedRunId, selectedNode, "error");

  return (
    <main className="app-shell h-screen overflow-hidden text-foreground" data-theme={theme}>
      <div className="flex h-full flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <Button asChild size="icon" title="返回任务工作区" variant="ghost">
              <a href="/">
                <ArrowLeft className="size-4" />
              </a>
            </Button>
            <div className="grid size-9 place-items-center rounded-md bg-primary/15 text-primary shadow-[0_12px_30px_rgba(31,141,130,0.12)]">
              <Activity className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Run Logs</h1>
              <p className="text-xs text-muted-foreground">本地 trace / 完整 IO</p>
            </div>
          </div>
          <Button onClick={() => void runsQuery.refetch()} type="button" variant="ghost">
            <RefreshCcw className="size-4" />
            刷新
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(360px,1fr)_minmax(420px,0.95fr)] gap-3 px-4 pb-4 max-xl:grid-cols-[280px_minmax(360px,1fr)_minmax(380px,0.9fr)] max-lg:grid-cols-1 max-lg:grid-rows-[260px_360px_minmax(420px,1fr)]">
          <section className="glass-panel min-h-0 overflow-hidden rounded-lg">
            <PanelHeader title="Runs" value={`${runs.length}`} />
            <div className="h-[calc(100%-52px)] overflow-y-auto px-2 pb-2">
              {runs.length === 0 ? (
                <EmptyState text="还没有本地 run trace。" />
              ) : (
                <div className="space-y-1">
                  {runs.map((run) => (
                    <RunListItem
                      isSelected={run.runId === selectedRunId}
                      key={run.runId}
                      onClick={() => {
                        setSelectedRunId(run.runId);
                        setSelectedNodeId(undefined);
                      }}
                      run={run}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="glass-panel min-h-0 overflow-hidden rounded-lg">
            <PanelHeader
              title="Execution Tree"
              value={trace ? `${trace.run.nodeCount ?? nodes.length} nodes` : traceQuery.isFetching ? "loading" : "-"}
            />
            <div className="h-[calc(100%-52px)] overflow-y-auto px-3 pb-3">
              {traceQuery.isFetching && !trace ? (
                <EmptyState text="正在读取 trace。" />
              ) : nodes.length === 0 ? (
                <EmptyState text="当前 run 没有 trace 节点。" />
              ) : (
                <TraceTree nodes={nodes} onSelect={setSelectedNodeId} selectedNodeId={selectedNode?.id} />
              )}
            </div>
          </section>

          <section className="glass-panel min-h-0 overflow-hidden rounded-lg">
            <PanelHeader title="Node Detail" value={selectedNode?.type ?? "-"} />
            <div className="h-[calc(100%-52px)] overflow-y-auto p-3">
              {selectedNode ? (
                <NodeDetail
                  errorPayload={errorPayload.data}
                  inputPayload={inputPayload.data}
                  isErrorLoading={errorPayload.isFetching}
                  isInputLoading={inputPayload.isFetching}
                  isOutputLoading={outputPayload.isFetching}
                  node={selectedNode}
                  outputPayload={outputPayload.data}
                />
              ) : (
                <EmptyState text="选择一个节点查看完整 IO。" />
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function useTracePayload(runId: string | undefined, node: RunTraceNode | undefined, kind: PayloadKind) {
  const hasPayload = Boolean(node?.[`${kind}Ref` as keyof RunTraceNode]);

  return useQuery({
    queryKey: ["debug-run-trace-payload", runId, node?.id, kind],
    queryFn: () => getDebugTraceNodePayload(runId ?? "", node?.id ?? "", kind),
    enabled: Boolean(runId && node?.id && hasPayload)
  });
}

function PanelHeader({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex h-[52px] items-center justify-between px-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <span className="rounded-md bg-muted/70 px-2 py-1 text-xs text-muted-foreground">{value}</span>
    </div>
  );
}

function RunListItem({ isSelected, onClick, run }: { isSelected: boolean; onClick: () => void; run: RunTraceSummary }) {
  return (
    <button
      className={`w-full rounded-md px-3 py-3 text-left transition-colors ${
        isSelected ? "bg-primary/12 text-foreground shadow-[0_12px_28px_rgba(31,141,130,0.1)]" : "hover:bg-muted/65"
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium">{formatRunTitle(run)}</span>
        <StatusBadge status={run.status} />
      </div>
      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{run.promptSummary ?? run.runId}</p>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock3 className="size-3" />
          {formatDateTime(run.createdAt)}
        </span>
        {run.durationMs !== undefined ? <span>{formatDuration(run.durationMs)}</span> : null}
      </div>
    </button>
  );
}

function TraceTree({
  nodes,
  onSelect,
  selectedNodeId
}: {
  nodes: RunTraceNode[];
  onSelect: (nodeId: string) => void;
  selectedNodeId?: string;
}) {
  const childrenByParent = useMemo(() => {
    const map = new Map<string, RunTraceNode[]>();
    const roots: RunTraceNode[] = [];
    const ids = new Set(nodes.map((node) => node.id));

    for (const node of nodes) {
      if (!node.parentId || !ids.has(node.parentId)) {
        roots.push(node);
        continue;
      }

      const children = map.get(node.parentId) ?? [];
      children.push(node);
      map.set(node.parentId, children);
    }

    for (const children of map.values()) {
      children.sort((a, b) => a.sequence - b.sequence);
    }

    roots.sort((a, b) => a.sequence - b.sequence);

    return { map, roots };
  }, [nodes]);

  return (
    <div className="space-y-1">
      {childrenByParent.roots.map((node) => (
        <TraceTreeNode
          childrenByParent={childrenByParent.map}
          isSelected={node.id === selectedNodeId}
          key={node.id}
          node={node}
          onSelect={onSelect}
          selectedNodeId={selectedNodeId}
        />
      ))}
    </div>
  );
}

function TraceTreeNode({
  childrenByParent,
  depth = 0,
  isSelected,
  node,
  onSelect,
  selectedNodeId
}: {
  childrenByParent: Map<string, RunTraceNode[]>;
  depth?: number;
  isSelected: boolean;
  node: RunTraceNode;
  onSelect: (nodeId: string) => void;
  selectedNodeId?: string;
}) {
  const children = childrenByParent.get(node.id) ?? [];
  const Icon = iconForNode(node);

  return (
    <div>
      <button
        className={`grid min-h-11 w-full grid-cols-[24px_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-sm transition-colors ${
          isSelected ? "bg-primary/12 text-foreground shadow-[0_12px_28px_rgba(31,141,130,0.1)]" : "hover:bg-muted/60"
        }`}
        onClick={() => onSelect(node.id)}
        style={{ paddingLeft: `${8 + depth * 18}px` }}
        type="button"
      >
        <span className="grid size-6 place-items-center text-muted-foreground">
          {children.length > 0 ? <ChevronRight className="size-4" /> : <Circle className="size-2 fill-current" />}
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0 text-primary" />
            <span className="truncate font-medium">{node.title}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {node.summary ?? `${node.type} #${node.sequence}`}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {node.durationMs !== undefined ? <span className="text-[11px] text-muted-foreground">{formatDuration(node.durationMs)}</span> : null}
          <StatusDot status={node.status} />
        </span>
      </button>
      {children.length > 0 ? (
        <div className="mt-1 space-y-1">
          {children.map((child) => (
            <TraceTreeNode
              childrenByParent={childrenByParent}
              depth={depth + 1}
              isSelected={child.id === selectedNodeId}
              key={child.id}
              node={child}
              onSelect={onSelect}
              selectedNodeId={selectedNodeId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NodeDetail({
  errorPayload,
  inputPayload,
  isErrorLoading,
  isInputLoading,
  isOutputLoading,
  node,
  outputPayload
}: {
  errorPayload: unknown;
  inputPayload: unknown;
  isErrorLoading: boolean;
  isInputLoading: boolean;
  isOutputLoading: boolean;
  node: RunTraceNode;
  outputPayload: unknown;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-md bg-muted/45 p-3">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{node.title}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{node.summary ?? node.id}</p>
          </div>
          <StatusBadge status={node.status} />
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <DetailItem label="type" value={node.type} />
          <DetailItem label="id" value={node.id} />
          <DetailItem label="started" value={formatDateTime(node.startedAt)} />
          <DetailItem label="duration" value={node.durationMs !== undefined ? formatDuration(node.durationMs) : "-"} />
        </dl>
      </div>

      {node.metadata ? <JsonBlock icon={<Braces className="size-4" />} title="Metadata" value={node.metadata} /> : null}
      <JsonBlock icon={<FileInput className="size-4" />} isLoading={isInputLoading} title="Input JSON" value={inputPayload} />
      <JsonBlock icon={<FileOutput className="size-4" />} isLoading={isOutputLoading} title="Output JSON" value={outputPayload} />
      {node.errorRef ? <JsonBlock icon={<AlertTriangle className="size-4" />} isLoading={isErrorLoading} title="Error JSON" value={errorPayload} /> : null}
    </div>
  );
}

function JsonBlock({
  icon,
  isLoading,
  title,
  value
}: {
  icon: ReactNode;
  isLoading?: boolean;
  title: string;
  value: unknown;
}) {
  return (
    <details className="rounded-md bg-code text-code-foreground" open={title !== "Metadata"}>
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-code-foreground/80">
        {icon}
        {title}
      </summary>
      <pre className="max-h-[420px] overflow-auto px-3 pb-3 text-xs leading-5">
        {isLoading ? "loading..." : value === undefined ? "No payload captured." : JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-background/35 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-foreground">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: RunTraceSummary["status"] }) {
  return (
    <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${statusClass(status)}`}>
      {status}
    </span>
  );
}

function StatusDot({ status }: { status: RunTraceNode["status"] }) {
  if (status === "success") {
    return <CheckCircle2 className="size-4 text-primary" />;
  }

  if (status === "error") {
    return <AlertTriangle className="size-4 text-red-400" />;
  }

  return <span className={`size-2 rounded-full ${status === "running" ? "bg-primary" : "bg-muted-foreground/45"}`} />;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid h-full min-h-40 place-items-center rounded-md bg-muted/35 px-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function iconForNode(node: RunTraceNode) {
  if (node.type === "tool") {
    return TerminalSquare;
  }

  if (node.type === "llm") {
    return Braces;
  }

  if (node.type === "artifact") {
    return Box;
  }

  if (node.type === "todo") {
    return CheckCircle2;
  }

  return Activity;
}

function statusClass(status: RunTraceSummary["status"]): string {
  if (status === "success") {
    return "bg-primary/15 text-primary";
  }

  if (status === "error") {
    return "bg-red-500/12 text-red-400";
  }

  if (status === "running") {
    return "bg-blue-500/12 text-blue-400";
  }

  return "bg-muted text-muted-foreground";
}

function formatRunTitle(run: RunTraceSummary): string {
  return run.model ? `${run.model}` : run.runId;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatDuration(value: number): string {
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  return `${(value / 1000).toFixed(1)}s`;
}
