import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { Artifact, ChatTimelineResponse, Run, RunEvent, RunEventType } from "../shared/types";
import { createChat, getChatTimeline, listChats, listLlmModels, listSkills, sendMessage } from "./api/client";
import { AgentStream } from "./components/agent-stream";
import { DebugRunsPage } from "./components/debug-runs-page";
import { NewTaskComposer } from "./components/new-task-composer";
import { ArtifactPreviewPanel } from "./components/artifact-preview-panel";
import { SessionSidebar } from "./components/session-sidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import type { ThemeMode } from "./lib/theme";

const runEventTypes: RunEventType[] = [
  "run.started",
  "thought.created",
  "summary.created",
  "todo.created",
  "todo.updated",
  "tool.started",
  "tool.finished",
  "sandbox.updated",
  "approval.requested",
  "artifact.created",
  "artifact.updated",
  "message.created",
  "run.completed",
  "run.failed"
];

const themeStorageKey = "knowme-agent.theme";
const modelStorageKey = "knowme-agent.model";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(themeStorageKey);

  return storedTheme === "dark" || storedTheme === "light" ? storedTheme : "light";
}

function getInitialModel(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage.getItem(modelStorageKey) ?? undefined;
}

export function App() {
  const queryClient = useQueryClient();
  const [selectedChatId, setSelectedChatId] = useState<string>();
  const [isNewTaskDraft, setIsNewTaskDraft] = useState(false);
  const [draft, setDraft] = useState("");
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>();
  const [selectedSkillName, setSelectedSkillName] = useState<string>();
  const [selectedModel, setSelectedModel] = useState<string | undefined>(getInitialModel);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [pathname, setPathname] = useState(() => (typeof window === "undefined" ? "/" : window.location.pathname));

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: listChats
  });
  const chats = chatsQuery.data ?? [];

  const skillsQuery = useQuery({
    queryKey: ["skills"],
    queryFn: listSkills
  });
  const skills = skillsQuery.data?.skills ?? [];

  const modelsQuery = useQuery({
    queryKey: ["llm-models"],
    queryFn: listLlmModels
  });
  const models = modelsQuery.data?.models ?? [];

  useEffect(() => {
    if (!selectedSkillName && skillsQuery.data) {
      setSelectedSkillName(skillsQuery.data.defaultSkillName || skills[0]?.name);
    }
  }, [selectedSkillName, skills, skillsQuery.data]);

  useEffect(() => {
    if (!modelsQuery.data) {
      return;
    }

    const knownModelIds = new Set(modelsQuery.data.models.map((model) => model.id));
    const preferredModel = selectedModel && knownModelIds.has(selectedModel) ? selectedModel : undefined;
    const fallbackModel =
      preferredModel ??
      (knownModelIds.has(modelsQuery.data.currentModel) ? modelsQuery.data.currentModel : undefined) ??
      (knownModelIds.has(modelsQuery.data.defaultModel) ? modelsQuery.data.defaultModel : undefined) ??
      modelsQuery.data.models[0]?.id;

    if (fallbackModel && fallbackModel !== selectedModel) {
      setSelectedModel(fallbackModel);
      window.localStorage.setItem(modelStorageKey, fallbackModel);
    }
  }, [modelsQuery.data, selectedModel]);

  useEffect(() => {
    if (!selectedChatId && !isNewTaskDraft && chats.length > 0) {
      setSelectedChatId(chats[0].id);
    }
  }, [chats, isNewTaskDraft, selectedChatId]);

  const timelineQuery = useQuery({
    queryKey: ["chat-timeline", selectedChatId],
    queryFn: () => getChatTimeline(selectedChatId ?? ""),
    enabled: Boolean(selectedChatId)
  });
  const timeline = timelineQuery.data;
  const messages = timeline?.messages ?? [];
  const runs = timeline?.runs ?? [];
  const eventsByRun = timeline?.eventsByRun ?? {};
  const artifactsByRun = timeline?.artifactsByRun ?? {};
  const allArtifacts = useMemo(
    () =>
      Object.values(artifactsByRun)
        .flat()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [artifactsByRun]
  );
  const activeChat = timeline?.chat ?? chats.find((chat) => chat.id === selectedChatId);
  const activeRun = useMemo(() => chooseActiveRun(runs), [runs]);
  const activeRunEvents = activeRun ? eventsByRun[activeRun.id] ?? [] : [];
  const selectedArtifact = useMemo(
    () => allArtifacts.find((artifact) => artifact.id === selectedArtifactId),
    [allArtifacts, selectedArtifactId]
  );

  useEffect(() => {
    if (selectedArtifactId && !selectedArtifact) {
      setSelectedArtifactId(undefined);
    }
  }, [selectedArtifact, selectedArtifactId]);

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const targetChat = selectedChatId ? activeChat : await createChat();

      if (!targetChat) {
        throw new Error("No chat is selected.");
      }

      const result = await sendMessage(targetChat.id, content, selectedModel, selectedSkillName);
      return { ...result, chat: targetChat };
    },
    onSuccess: async ({ chat, message, run }) => {
      setDraft("");
      setSelectedArtifactId(undefined);
      setSelectedChatId(run.chatId);
      setIsNewTaskDraft(false);
      mergeTimeline(queryClient, run.chatId, emptyTimeline(chat), (current) => ({
        ...current,
        messages: upsertById(current.messages, message).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        runs: upsertById(current.runs, run).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        eventsByRun: {
          ...current.eventsByRun,
          [run.id]: current.eventsByRun[run.id] ?? []
        },
        artifactsByRun: {
          ...current.artifactsByRun,
          [run.id]: current.artifactsByRun[run.id] ?? []
        }
      }));
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
    }
  });

  useEffect(() => {
    if (!activeRun || isTerminalRun(activeRun)) {
      return;
    }

    const source = new EventSource(`/api/runs/${activeRun.id}/events`);

    const handleEvent = (event: MessageEvent<string>) => {
      const runEvent = JSON.parse(event.data) as RunEvent;

      mergeRunEvent(queryClient, runEvent);

      if (runEvent.type === "run.completed" || runEvent.type === "run.failed") {
        source.close();
        void queryClient.invalidateQueries({ queryKey: ["chat-timeline", runEvent.chatId] });
        void queryClient.invalidateQueries({ queryKey: ["chats"] });
      }
    };

    for (const type of runEventTypes) {
      source.addEventListener(type, handleEvent);
    }

    source.onerror = () => {
      source.close();
    };

    return () => {
      for (const type of runEventTypes) {
        source.removeEventListener(type, handleEvent);
      }
      source.close();
    };
  }, [activeRun, queryClient]);

  const showNewTaskComposer = isNewTaskDraft || !selectedChatId || (!timelineQuery.isFetching && messages.length === 0 && runs.length === 0);
  const isSendDisabled = !selectedSkillName || !selectedModel || sendMessageMutation.isPending;

  function selectChat(chatId: string) {
    setIsNewTaskDraft(false);
    setSelectedChatId(chatId);
    setSelectedArtifactId(undefined);
  }

  function startNewTask() {
    setIsNewTaskDraft(true);
    setSelectedChatId(undefined);
    setSelectedArtifactId(undefined);
  }

  function handleSubmit() {
    const content = draft.trim();

    if (!content || sendMessageMutation.isPending) {
      return;
    }

    sendMessageMutation.mutate(content);
  }

  function handleThemeChange(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
  }

  function handleModelChange(nextModel: string) {
    setSelectedModel(nextModel);
    window.localStorage.setItem(modelStorageKey, nextModel);
  }

  if (pathname.startsWith("/debug/runs")) {
    return <DebugRunsPage theme={theme} />;
  }

  return (
    <main className="app-shell h-screen overflow-hidden text-foreground" data-theme={theme}>
      <div className="grid h-full grid-cols-[248px_minmax(0,1fr)] max-lg:grid-cols-1">
        <SessionSidebar
          chats={chats}
          isNewTaskActive={isNewTaskDraft || !selectedChatId}
          onNewTask={startNewTask}
          onSelectChat={selectChat}
          onThemeChange={handleThemeChange}
          selectedChatId={selectedChatId}
          theme={theme}
        />

        {showNewTaskComposer ? (
          <NewTaskComposer
            draft={draft}
            isSending={isSendDisabled}
            models={models}
            onDraftChange={setDraft}
            onModelChange={handleModelChange}
            onSkillChange={setSelectedSkillName}
            onSubmit={handleSubmit}
            selectedModel={selectedModel}
            selectedSkillName={selectedSkillName}
            skills={skills}
          />
        ) : (
          <ResizablePanelGroup className="min-h-0" orientation="horizontal">
            <ResizablePanel defaultSize={56} minSize={38}>
              <AgentStream
                activeChat={activeChat}
                activeRun={activeRun}
                artifactsByRun={artifactsByRun}
                draft={draft}
                eventsByRun={eventsByRun}
                isSending={isSendDisabled}
                messages={messages}
                models={models}
                onDraftChange={setDraft}
                onModelChange={handleModelChange}
                onOpenArtifact={setSelectedArtifactId}
                onSkillChange={setSelectedSkillName}
                onSubmit={handleSubmit}
                runs={runs}
                selectedArtifactId={selectedArtifactId}
                selectedModel={selectedModel}
                selectedSkillName={selectedSkillName}
                skills={skills}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={44} minSize={30}>
              <ArtifactPreviewPanel
                activeRun={activeRun}
                artifacts={activeRun ? artifactsByRun[activeRun.id] ?? [] : []}
                events={activeRunEvents}
                onCloseArtifact={() => setSelectedArtifactId(undefined)}
                onOpenArtifact={setSelectedArtifactId}
                selectedArtifact={selectedArtifact}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </main>
  );
}

function chooseActiveRun(runs: Run[]): Run | undefined {
  return [...runs].reverse().find((run) => !isTerminalRun(run)) ?? runs.at(-1);
}

function isTerminalRun(run: Run): boolean {
  return run.status === "completed" || run.status === "failed";
}

function mergeRunEvent(queryClient: ReturnType<typeof useQueryClient>, event: RunEvent) {
  mergeTimeline(queryClient, event.chatId, undefined, (current) => {
    const currentEvents = current.eventsByRun[event.runId] ?? [];
    const nextEvents = upsertById(currentEvents, event).sort((a, b) => a.sequence - b.sequence);
    const nextRuns = current.runs.map((run) => {
      if (run.id !== event.runId) {
        return run;
      }

      if (event.type === "run.started") {
        return { ...run, status: "running" as const, updatedAt: event.createdAt };
      }

      if (event.type === "run.completed" || event.type === "run.failed") {
        return {
          ...run,
          status: event.type === "run.completed" ? ("completed" as const) : ("failed" as const),
          updatedAt: event.createdAt,
          completedAt: event.createdAt
        };
      }

      return run;
    });
    const currentArtifacts = current.artifactsByRun[event.runId] ?? [];
    const nextArtifacts = event.payload?.artifact
      ? upsertById(currentArtifacts, event.payload.artifact).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      : currentArtifacts;

    return {
      ...current,
      runs: nextRuns,
      eventsByRun: {
        ...current.eventsByRun,
        [event.runId]: nextEvents
      },
      artifactsByRun: {
        ...current.artifactsByRun,
        [event.runId]: nextArtifacts
      }
    };
  });
}

function mergeTimeline(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: string,
  fallback: ChatTimelineResponse | undefined,
  updater: (current: ChatTimelineResponse) => ChatTimelineResponse
) {
  queryClient.setQueryData<ChatTimelineResponse>(["chat-timeline", chatId], (current) => {
    const base = current ?? fallback;
    return base ? updater(base) : current;
  });
}

function emptyTimeline(chat: ChatTimelineResponse["chat"]): ChatTimelineResponse {
  return {
    chat,
    messages: [],
    runs: [],
    eventsByRun: {},
    artifactsByRun: {}
  };
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const index = items.findIndex((item) => item.id === nextItem.id);

  if (index === -1) {
    return [...items, nextItem];
  }

  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}
