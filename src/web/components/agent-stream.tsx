import { Bot, Check, CheckCircle2, Circle, CircleDotDashed, Image as ImageIcon, Paperclip, Send, Wrench, XCircle } from "lucide-react";
import type { FormEvent, ReactNode, UIEvent } from "react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
    <section className="grid h-full min-h-0 grid-rows-[4rem_minmax(0,1fr)_auto] bg-workspace">
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
        className="min-h-0 overflow-y-auto overscroll-contain"
        data-agent-flow-scroll
        onScroll={handleFlowScroll}
        ref={flowRef}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-7">
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
      <div className="max-w-[82%] rounded-lg bg-user-message px-5 py-3 text-sm leading-6 text-foreground shadow-[var(--shadow-soft)]">
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
  const eventArtifacts = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const visibleEvents = events.filter((event) => event.visibility !== "internal" && event.visibility !== "debug");
  const flowItems = buildFlowItems(visibleEvents);

  function renderEvent(event: RunEvent) {
    if (event.type === "artifact.created" && event.artifactId) {
      const artifact = eventArtifacts.get(event.artifactId);

      if (artifact) {
        return (
          <ArtifactEvent
            artifact={artifact}
            isSelected={artifact.id === selectedArtifactId}
            key={event.id}
            onOpenArtifact={onOpenArtifact}
          />
        );
      }
    }

    return <ProgressEvent event={event} key={event.id} />;
  }

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

        <div className="space-y-3">
          {events.length === 0 ? (
            <ProgressLine icon={<CircleDotDashed className="size-4" />} title="等待 runtime 事件" detail={run.id} />
          ) : (
            flowItems.map((item) => {
              if (item.kind === "event") {
                return renderEvent(item.event);
              }

              const children = item.step.children.map(renderEvent).filter(Boolean);

              return (
                <StepGroup key={item.step.id} step={item.step}>
                  {children}
                </StepGroup>
              );
            })
          )}
        </div>

        {run.status === "completed" ? (
          <RunStatusLine icon={<CheckCircle2 className="size-4" />} text="Run completed" tone="done" />
        ) : null}
        {run.status === "failed" ? <RunStatusLine icon={<XCircle className="size-4" />} text="Run failed" tone="failed" /> : null}

        {assistantMessages.map((message) => (
          <AssistantMessage key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}

type FlowStep = {
  id: string;
  title: string;
  event: RunEvent;
  children: RunEvent[];
};

type FlowItem = { kind: "event"; event: RunEvent } | { kind: "step"; step: FlowStep };

function buildFlowItems(events: RunEvent[]): FlowItem[] {
  const items: FlowItem[] = [];
  const steps = new Map<string, FlowStep>();

  for (const event of events) {
    if (event.flowKind === "todo" && event.stepId) {
      const existing = steps.get(event.stepId);

      if (existing) {
        existing.title = event.stepTitle ?? event.title;
        existing.event = event;
      } else {
        const step: FlowStep = {
          id: event.stepId,
          title: event.stepTitle ?? event.title,
          event,
          children: []
        };
        steps.set(event.stepId, step);
        items.push({ kind: "step", step });
      }
      continue;
    }

    if (event.stepId) {
      let step = steps.get(event.stepId);

      if (!step) {
        step = {
          id: event.stepId,
          title: event.stepTitle ?? "当前步骤",
          event: {
            ...event,
            id: `${event.stepId}:placeholder`,
            title: event.stepTitle ?? "当前步骤",
            detail: undefined,
            flowKind: "todo",
            type: "todo.updated"
          },
          children: []
        };
        steps.set(event.stepId, step);
        items.push({ kind: "step", step });
      }

      step.children.push(event);
      continue;
    }

    items.push({ kind: "event", event });
  }

  return items;
}

function StepGroup({ children, step }: { children: ReactNode[]; step: FlowStep }) {
  return (
    <div className="rounded-lg bg-card/55 p-3 shadow-[var(--shadow-soft)]">
      <ProgressEvent event={step.event} />
      <div className="ml-2 mt-3 space-y-2 border-l border-border/45 pl-6">
        {children.length === 0 ? <p className="text-xs text-muted-foreground">等待步骤内输出...</p> : children}
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex gap-3">
      <AgentAvatar />
      <div className="min-w-0 flex-1 space-y-3">
        <AgentName />
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{message.content}</p>
      </div>
    </div>
  );
}

function ProgressEvent({ event }: { event: RunEvent }) {
  if (event.type === "message.created" || event.type === "run.completed") {
    return null;
  }

  const isDone = event.status === "done" || event.status === "completed";
  const isTool = event.type.startsWith("tool.");

  return (
    <ProgressLine
      detail={event.detail}
      icon={isDone ? <Check className="size-4" /> : isTool ? <Wrench className="size-4" /> : <Circle className="size-4" />}
      tone={isDone ? "done" : isTool ? "tool" : "pending"}
      title={event.title}
    />
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

function RunStatusLine({ icon, text, tone }: { icon: ReactNode; text: string; tone: "done" | "failed" }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${tone === "done" ? "text-emerald-400" : "text-destructive"}`}>
      {icon}
      {text}
    </div>
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
