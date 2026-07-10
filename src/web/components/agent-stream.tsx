import { Bot, Check, CheckCircle2, Image as ImageIcon, LoaderCircle, Paperclip, Send, XCircle } from "lucide-react";
import type { FormEvent, ReactNode, UIEvent } from "react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { buildRunFlowViewModel } from "../../shared/run-flow-view-model";
import type { RunFlowAction, RunFlowPlanning, RunFlowTodo, RunFlowViewModel } from "../../shared/run-flow-view-model";
import type { Artifact, ChatMessage, ChatSession, LlmModelOption, Run, RunEvent, SkillOption } from "../../shared/types";
import { ArtifactKindIcon } from "./artifact-renderers";
import { ModelPicker } from "./model-picker";
import { SkillPicker } from "./skill-picker";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export function AgentStream({
  activeChat,
  activeRun,
  artifactsByRun,
  draft,
  eventsByRun,
  isSending,
  messages,
  models,
  onDraftChange,
  onModelChange,
  onOpenArtifact,
  onSkillChange,
  onSubmit,
  runs,
  selectedArtifactId,
  selectedModel,
  selectedSkillName,
  skills
}: {
  activeChat?: ChatSession;
  activeRun?: Run;
  artifactsByRun: Record<string, Artifact[]>;
  draft: string;
  eventsByRun: Record<string, RunEvent[]>;
  isSending: boolean;
  messages: ChatMessage[];
  models: LlmModelOption[];
  onDraftChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onOpenArtifact: (artifactId: string) => void;
  onSkillChange: (value: string) => void;
  onSubmit: () => void;
  runs: Run[];
  selectedArtifactId?: string;
  selectedModel?: string;
  selectedSkillName?: string;
  skills: SkillOption[];
}) {
  const sortedMessages = useMemo(() => [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [messages]);
  const sortedRuns = useMemo(() => [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [runs]);
  const runIds = useMemo(() => new Set(sortedRuns.map((run) => run.id)), [sortedRuns]);
  const assistantMessagesByRun = useMemo(() => {
    const grouped = new Map<string, ChatMessage[]>();

    for (const message of sortedMessages) {
      if (message.role !== "assistant" || !message.runId) {
        continue;
      }

      grouped.set(message.runId, [...(grouped.get(message.runId) ?? []), message]);
    }

    return grouped;
  }, [sortedMessages]);
  const runsByUserMessage = useMemo(() => {
    const grouped = new Map<string, Run[]>();

    for (const run of sortedRuns) {
      grouped.set(run.userMessageId, [...(grouped.get(run.userMessageId) ?? []), run]);
    }

    return grouped;
  }, [sortedRuns]);
  const orphanRuns = useMemo(
    () => sortedRuns.filter((run) => !sortedMessages.some((message) => message.id === run.userMessageId)),
    [sortedMessages, sortedRuns]
  );
  const flowVersion = useMemo(
    () =>
      [
        sortedMessages.length,
        sortedRuns.map((run) => `${run.id}:${run.status}:${run.updatedAt}`).join("|"),
        Object.values(eventsByRun)
          .map((events) => events.length)
          .join("|"),
        Object.values(artifactsByRun)
          .map((artifacts) => artifacts.length)
          .join("|")
      ].join(":"),
    [artifactsByRun, eventsByRun, sortedMessages.length, sortedRuns]
  );
  const flowRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowFlowRef = useRef(true);

  useEffect(() => {
    shouldFollowFlowRef.current = true;
  }, [activeChat?.id]);

  useLayoutEffect(() => {
    const flow = flowRef.current;

    if (!flow || !shouldFollowFlowRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      flow.scrollTo({ top: flow.scrollHeight });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [flowVersion]);

  function handleFlowScroll(event: UIEvent<HTMLDivElement>) {
    const flow = event.currentTarget;
    const distanceFromBottom = flow.scrollHeight - flow.scrollTop - flow.clientHeight;
    shouldFollowFlowRef.current = distanceFromBottom < 80;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 overflow-hidden grid-rows-[4rem_minmax(0,1fr)_auto] bg-workspace">
      <header className="flex h-16 shrink-0 items-center justify-between px-6 backdrop-blur-xl">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">knowme-agent</h2>
          <p className="truncate text-xs text-muted-foreground">{activeChat?.title ?? "New task"}</p>
        </div>
        <Badge className="gap-1.5" variant={activeRun?.status === "completed" ? "success" : "outline"}>
          {activeRun?.status ?? "idle"}
        </Badge>
      </header>

      <div
        className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain"
        data-agent-flow-scroll
        onScroll={handleFlowScroll}
        ref={flowRef}
      >
        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8 px-6 py-7">
          {sortedMessages.length === 0 && sortedRuns.length === 0 ? <WelcomeCard /> : null}

          {sortedMessages.map((message) => {
            if (message.role === "assistant" && message.runId && runIds.has(message.runId)) {
              return null;
            }

            if (message.role !== "user") {
              return <AssistantMessage key={message.id} message={message} />;
            }

            const messageRuns = runsByUserMessage.get(message.id) ?? [];

            return (
              <Fragment key={message.id}>
                <UserPrompt message={message} />
                {messageRuns.map((run) => (
                  <AgentRunCard
                    artifacts={artifactsByRun[run.id] ?? []}
                    assistantMessages={assistantMessagesByRun.get(run.id) ?? []}
                    events={eventsByRun[run.id] ?? []}
                    key={run.id}
                    onOpenArtifact={onOpenArtifact}
                    run={run}
                    selectedArtifactId={selectedArtifactId}
                  />
                ))}
              </Fragment>
            );
          })}

          {orphanRuns.map((run) => (
            <AgentRunCard
              artifacts={artifactsByRun[run.id] ?? []}
              assistantMessages={assistantMessagesByRun.get(run.id) ?? []}
              events={eventsByRun[run.id] ?? []}
              key={run.id}
              onOpenArtifact={onOpenArtifact}
              run={run}
              selectedArtifactId={selectedArtifactId}
            />
          ))}
        </div>
      </div>

      <footer className="shrink-0 bg-workspace px-6 py-4 backdrop-blur-xl" data-agent-composer>
        <form className="glass-strong relative mx-auto w-full max-w-3xl rounded-lg p-2" onSubmit={handleSubmit}>
          <Textarea
            aria-label="Message"
            className="max-h-40 min-h-20 resize-none bg-transparent px-3 pb-11 pt-3 shadow-none focus-visible:ring-0"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="给 knowme-agent 发送消息"
            rows={2}
            value={draft}
          />

          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" type="button" variant="outline">
                    <Paperclip className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Attach files</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="flex min-w-0 items-center gap-2">
              <ModelPicker models={models} onChange={onModelChange} selectedModel={selectedModel} />
              <SkillPicker onChange={onSkillChange} selectedSkillName={selectedSkillName} skills={skills} />
              <Button disabled={!draft.trim() || isSending || !selectedSkillName || !selectedModel} size="icon" title="Send" type="submit">
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </form>
      </footer>
    </section>
  );
}

function UserPrompt({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%] break-words [overflow-wrap:anywhere] rounded-lg bg-user-message px-5 py-3 text-sm leading-6 text-foreground shadow-[var(--shadow-soft)]">
        {message.content}
      </div>
    </div>
  );
}

function WelcomeCard() {
  return (
    <div className="flex gap-3">
      <AgentAvatar />
      <div className="space-y-3">
        <AgentName />
        <p className="text-sm leading-6 text-muted-foreground">选择会话或发送新任务后，这里会显示真实 runtime 事件。</p>
      </div>
    </div>
  );
}

function AgentRunCard({
  artifacts,
  assistantMessages,
  events,
  onOpenArtifact,
  run,
  selectedArtifactId
}: {
  artifacts: Artifact[];
  assistantMessages: ChatMessage[];
  events: RunEvent[];
  onOpenArtifact: (artifactId: string) => void;
  run: Run;
  selectedArtifactId?: string;
}) {
  const flow = useMemo(
    () =>
      buildRunFlowViewModel({
        run,
        events,
        artifacts,
        assistantMessages
      }),
    [artifacts, assistantMessages, events, run]
  );
  const hasVisibleWork =
    Boolean(flow.planning) ||
    flow.todos.length > 0 ||
    flow.runActions.length > 0 ||
    flow.runArtifacts.length > 0 ||
    flow.finalMessages.length > 0;
  const isRunning = run.status === "queued" || run.status === "running";

  return (
    <div className="flex gap-3">
      <AgentAvatar />
      <div className="min-w-0 flex-1 space-y-5">
        <div>
          <div className="flex min-w-0 items-center gap-2">
            <AgentName />
            <Badge variant={run.status === "completed" ? "success" : "outline"}>{run.status}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {[run.skillName ?? "general-agent", run.model].filter(Boolean).join(" / ") || run.id}
          </p>
        </div>

        {isRunning ? <RunActivity events={events} flow={flow} /> : null}

        <div className="space-y-3">
          {!hasVisibleWork ? <ProgressLine icon={<LoaderCircle className="size-4 animate-spin" />} title="正在等待执行进展" detail={run.id} /> : null}
          {flow.planning ? <PlanningBlock planning={flow.planning} /> : null}
          {flow.todos.map((todo, index) => (
            <TodoBlock
              index={index}
              key={todo.id}
              onOpenArtifact={onOpenArtifact}
              selectedArtifactId={selectedArtifactId}
              todo={todo}
            />
          ))}
          {flow.runActions.length > 0 ? <ActionList actions={flow.runActions} /> : null}
          {flow.runArtifacts.length > 0 ? (
            <ArtifactList
              artifacts={flow.runArtifacts}
              onOpenArtifact={onOpenArtifact}
              selectedArtifactId={selectedArtifactId}
            />
          ) : null}
        </div>

        {flow.finalMessages.map((message) => (
          <FinalMessage key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}

function RunActivity({ events, flow }: { events: RunEvent[]; flow: RunFlowViewModel }) {
  const actions = [...flow.runActions, ...flow.todos.flatMap((todo) => todo.actions)];
  const activeAction = [...actions].reverse().find((action) => action.status === "running");
  const activeTodo = flow.todos.find((todo) => todo.status === "in_progress");
  const activeEvent = [...events]
    .sort((a, b) => a.sequence - b.sequence)
    .reverse()
    .find((event) => event.status === "running" || event.status === "in_progress");
  const title = activeAction
    ? `正在执行 ${activeAction.title}`
    : activeTodo
      ? `正在处理：${activeTodo.title}`
      : activeEvent?.title ?? "正在准备执行";
  const detail = activeAction?.detail ?? activeTodo?.summary ?? activeEvent?.detail ?? "正在接收执行结果…";

  return (
    <div aria-live="polite" className="flex min-w-0 items-start gap-3 rounded-lg bg-primary/8 px-4 py-3 text-sm">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <LoaderCircle className="size-4 animate-spin" />
      </span>
      <div className="min-w-0">
        <p className="break-words font-medium text-foreground">{title}</p>
        <p className="mt-1 break-words [overflow-wrap:anywhere] text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function PlanningBlock({ planning }: { planning: RunFlowPlanning }) {
  return (
    <details className="group rounded-lg bg-card/60 p-4 shadow-[var(--shadow-soft)]" open={planning.status === "running"}>
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <StatusDot status={planning.status === "completed" ? "completed" : "running"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-foreground">已制定执行计划</p>
            <Badge variant="outline">{planning.todos.length} todos</Badge>
          </div>
          {planning.goal ? <p className="mt-1 truncate text-sm text-muted-foreground">{planning.goal}</p> : null}
        </div>
      </summary>

      {planning.todos.length > 0 ? (
        <div className="mt-4 space-y-3 pl-8">
          {planning.todos.map((todo, index) => (
            <div className="rounded-md bg-background/45 px-3 py-2" key={todo.id}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">{index + 1}.</span>
                <p className="text-sm font-medium text-foreground">{todo.title}</p>
              </div>
              {todo.description ? <p className="mt-1 break-words [overflow-wrap:anywhere] text-sm leading-6 text-muted-foreground">{todo.description}</p> : null}
              {todo.expectedOutput ? <MetaLine label="预期输出" value={todo.expectedOutput} /> : null}
              {todo.doneCriteria.length > 0 ? <MetaLine label="完成标准" value={todo.doneCriteria.join("；")} /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}

function TodoBlock({
  index,
  onOpenArtifact,
  selectedArtifactId,
  todo
}: {
  index: number;
  onOpenArtifact: (artifactId: string) => void;
  selectedArtifactId?: string;
  todo: RunFlowTodo;
}) {
  return (
    <details className="group rounded-lg bg-card/60 p-4 shadow-[var(--shadow-soft)]" open={todo.status === "in_progress"}>
      <summary className="flex cursor-pointer list-none items-start gap-3">
        <StatusDot status={todo.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">Todo {index + 1}</p>
            <span className="text-sm text-muted-foreground">·</span>
            <p className="min-w-0 text-sm font-medium text-foreground">{todo.title}</p>
            <Badge variant={todo.status === "completed" ? "success" : todo.status === "failed" ? "warning" : "outline"}>
              {todo.status}
            </Badge>
          </div>
          {todo.summary ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{todo.summary}</p> : null}
          {!todo.summary && todo.description ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{todo.description}</p> : null}
        </div>
      </summary>

      <div className="mt-4">
        {todo.summary ? (
          <div className="rounded-md bg-background/45 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">Summary</p>
            <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-foreground">{todo.summary}</p>
          </div>
        ) : null}
        {todo.actions.length > 0 ? <ActionList actions={todo.actions} /> : null}
        {todo.artifacts.length > 0 ? (
          <ArtifactList artifacts={todo.artifacts} onOpenArtifact={onOpenArtifact} selectedArtifactId={selectedArtifactId} />
        ) : null}
      </div>
    </details>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex gap-3">
      <AgentAvatar />
      <div className="min-w-0 flex-1 space-y-3">
        <AgentName />
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-foreground">{message.content}</p>
      </div>
    </div>
  );
}

function FinalMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="rounded-lg bg-card/60 p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="size-5 text-emerald-300" />
        <p className="font-medium text-foreground">Final</p>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-foreground">{message.content}</p>
    </div>
  );
}

function ActionList({ actions }: { actions: RunFlowAction[] }) {
  return (
    <div className="mt-4 space-y-2 pl-8">
      {actions.map((action) => (
        <ActionLine action={action} key={action.id} />
      ))}
    </div>
  );
}

function ActionLine({ action }: { action: RunFlowAction }) {
  return (
    <details className="group rounded-md bg-background/45 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-start gap-3 text-sm">
        <StatusIcon status={action.status} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{action.title}</span>
            {action.durationMs !== undefined ? <span className="text-xs text-muted-foreground">{action.durationMs}ms</span> : null}
          </div>
          {action.detail ? <p className="mt-1 break-words text-muted-foreground">{action.detail}</p> : null}
        </div>
      </summary>
      <div className="mt-2 pl-8 text-xs leading-5 text-muted-foreground">
        {action.toolName ? <p>tool: {action.toolName}</p> : null}
        <p>events: {action.eventIds.join(", ")}</p>
      </div>
    </details>
  );
}

function ArtifactList({
  artifacts,
  onOpenArtifact,
  selectedArtifactId
}: {
  artifacts: Artifact[];
  onOpenArtifact: (artifactId: string) => void;
  selectedArtifactId?: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2 pl-8">
      {artifacts.map((artifact) => (
        <ArtifactEvent
          artifact={artifact}
          isSelected={artifact.id === selectedArtifactId}
          key={artifact.id}
          onOpenArtifact={onOpenArtifact}
        />
      ))}
    </div>
  );
}

function ProgressLine({
  detail,
  icon,
  title,
  tone = "pending"
}: {
  detail?: string;
  icon: ReactNode;
  title: string;
  tone?: "done" | "pending" | "tool";
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
          tone === "done"
            ? "bg-emerald-500/15 text-emerald-300"
            : tone === "tool"
              ? "bg-sky-500/15 text-sky-300"
              : "bg-muted/80 text-muted-foreground"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        {detail ? <p className="mt-1 break-words text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: "running" | RunFlowTodo["status"] }) {
  return (
    <div
      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
        status === "completed"
          ? "bg-emerald-500/15 text-emerald-300"
          : status === "failed"
            ? "bg-destructive/15 text-destructive"
            : "bg-muted/80 text-muted-foreground"
      }`}
    >
      {status === "completed" ? (
        <Check className="size-4" />
      ) : status === "failed" ? (
        <XCircle className="size-4" />
      ) : (
        <LoaderCircle className="size-4 animate-spin" />
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: RunFlowAction["status"] }) {
  if (status === "completed") {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />;
  }

  if (status === "failed") {
    return <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />;
  }

  return <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-sky-300" />;
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-1 text-xs leading-5 text-muted-foreground">
      <span className="font-medium text-foreground/80">{label}：</span>
      <span className="break-words [overflow-wrap:anywhere]">{value}</span>
    </p>
  );
}

function ArtifactEvent({
  artifact,
  isSelected,
  onOpenArtifact
}: {
  artifact: Artifact;
  isSelected: boolean;
  onOpenArtifact: (artifactId: string) => void;
}) {
  if (artifact.display.mode === "hidden") {
    return null;
  }

  if (artifact.display.mode === "inline") {
    return <InlineImageArtifact artifact={artifact} />;
  }

  const canOpenPreview =
    (artifact.display.mode === "button" || artifact.display.mode === "preview") && artifact.display.previewTarget !== "none";

  return (
    <button
      className={`inline-flex max-w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-all ${
        isSelected
          ? "bg-primary/15 text-foreground shadow-[0_10px_28px_rgba(37,208,186,0.12)]"
          : "bg-card/70 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      }`}
      disabled={!canOpenPreview}
      onClick={() => {
        if (canOpenPreview) {
          onOpenArtifact(artifact.id);
        }
      }}
      type="button"
    >
      <ArtifactKindIcon artifact={artifact} />
      <span className="truncate font-medium text-foreground">{artifact.title}</span>
      <Badge variant="outline">{artifact.kind}</Badge>
      <span className="hidden text-xs text-muted-foreground sm:inline">{artifact.display.label ?? "打开"}</span>
    </button>
  );
}

function InlineImageArtifact({ artifact }: { artifact: Artifact }) {
  if (artifact.kind !== "image") {
    return null;
  }

  return (
    <div className="glass-panel max-w-xl rounded-lg p-3">
      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        <ImageIcon className="size-4" />
        {artifact.title}
      </div>
      <img alt={artifact.alt ?? artifact.title} className="w-full rounded-md shadow-[var(--shadow-soft)]" src={artifact.url} />
    </div>
  );
}

function AgentName() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg font-semibold">knowme-agent</span>
    </div>
  );
}

function AgentAvatar() {
  return (
    <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary shadow-[0_10px_28px_rgba(37,208,186,0.1)]">
      <Bot className="size-4" />
    </div>
  );
}
