import {
  Bot,
  Check,
  CheckCircle2,
  Circle,
  CircleDotDashed,
  Image as ImageIcon,
  Paperclip,
  Send,
  Wrench
} from "lucide-react";
import type { FormEvent, ReactNode, UIEvent } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Artifact, ChatMessage, ChatSession, Run, RunEvent } from "../../shared/types";
import { ArtifactKindIcon } from "./artifact-renderers";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export function AgentStream({
  activeChat,
  activeRun,
  artifacts,
  draft,
  events,
  isSending,
  messages,
  onDraftChange,
  onOpenArtifact,
  onSubmit,
  selectedArtifactId
}: {
  activeChat?: ChatSession;
  activeRun?: Run;
  artifacts: Artifact[];
  draft: string;
  events: RunEvent[];
  isSending: boolean;
  messages: ChatMessage[];
  onDraftChange: (value: string) => void;
  onOpenArtifact: (artifactId: string) => void;
  onSubmit: () => void;
  selectedArtifactId?: string;
}) {
  const latestUserMessage = useMemo(() => [...messages].reverse().find((message) => message.role === "user"), [messages]);
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant" && message.runId === activeRun?.id),
    [messages, activeRun?.id]
  );
  const flowRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowFlowRef = useRef(true);

  useEffect(() => {
    shouldFollowFlowRef.current = true;
  }, [activeChat?.id, activeRun?.id]);

  useLayoutEffect(() => {
    const flow = flowRef.current;

    if (!flow || !shouldFollowFlowRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      flow.scrollTo({ top: flow.scrollHeight });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeRun?.status, artifacts.length, events.length, latestAssistantMessage?.id, latestUserMessage?.id]);

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
          {latestUserMessage ? <UserPrompt message={latestUserMessage} /> : null}

          {activeRun || events.length > 0 ? (
            <AgentRunCard
              activeRun={activeRun}
              artifacts={artifacts}
              events={events}
              onOpenArtifact={onOpenArtifact}
              selectedArtifactId={selectedArtifactId}
            />
          ) : (
            <WelcomeCard />
          )}

          {latestAssistantMessage ? <AssistantMessage message={latestAssistantMessage} /> : null}
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

            <Button disabled={!draft.trim() || isSending} size="icon" title="Send" type="submit">
              <Send className="size-4" />
            </Button>
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
        <p className="text-sm leading-6 text-muted-foreground">
          应用层已经准备好。发送一条消息后，中间会展示 Agent 的 todo、工具使用和产物入口；右侧是沙箱预览与操作区。
        </p>
      </div>
    </div>
  );
}

function AgentRunCard({
  activeRun,
  artifacts,
  events,
  onOpenArtifact,
  selectedArtifactId
}: {
  activeRun?: Run;
  artifacts: Artifact[];
  events: RunEvent[];
  onOpenArtifact: (artifactId: string) => void;
  selectedArtifactId?: string;
}) {
  const eventArtifacts = new Map(artifacts.map((artifact) => [artifact.id, artifact]));

  return (
    <div className="flex gap-3">
      <AgentAvatar />
      <div className="min-w-0 flex-1 space-y-5">
        <AgentName />
        <p className="text-sm leading-6">让我处理这个任务。我会先拆 todo，再执行工具，必要时把可操作的预览放到右侧沙箱。</p>

        <div className="space-y-3">
          {events.length === 0 ? (
            <ProgressLine icon={<CircleDotDashed className="size-4" />} title="等待执行" detail="Run 已创建，正在等待第一批事件。" />
          ) : (
            events
              .filter((event) => event.visibility !== "internal" && event.visibility !== "debug")
              .map((event) => {
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
              })
          )}
        </div>

        {activeRun?.status === "completed" ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="size-4" />
            Run completed
          </div>
        ) : null}
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
    (artifact.display.mode === "button" || artifact.display.mode === "preview") && artifact.display.previewTarget === "sandbox";

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
