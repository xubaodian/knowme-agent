import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { Artifact, Run, RunEvent, RunEventType } from "../shared/types";
import { createChat, listChats, listMessages, sendMessage } from "./api/client";
import { AgentStream } from "./components/agent-stream";
import { DebugRunsPage } from "./components/debug-runs-page";
import { NewTaskComposer } from "./components/new-task-composer";
import { SandboxPanel } from "./components/sandbox-panel";
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

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(themeStorageKey);

  return storedTheme === "dark" || storedTheme === "light" ? storedTheme : "light";
}

export function App() {
  const queryClient = useQueryClient();
  const [selectedChatId, setSelectedChatId] = useState<string>();
  const [draft, setDraft] = useState("");
  const [activeRun, setActiveRun] = useState<Run>();
  const [runEvents, setRunEvents] = useState<RunEvent[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>();
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

  useEffect(() => {
    if (!selectedChatId && chats.length > 0) {
      setSelectedChatId(chats[0].id);
    }
  }, [chats, selectedChatId]);

  const messagesQuery = useQuery({
    queryKey: ["messages", selectedChatId],
    queryFn: () => listMessages(selectedChatId ?? ""),
    enabled: Boolean(selectedChatId)
  });

  const createChatMutation = useMutation({
    mutationFn: createChat,
    onSuccess: async (chat) => {
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
      selectChat(chat.id);
    }
  });

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => sendMessage(selectedChatId ?? "", content),
    onSuccess: async ({ run }) => {
      setDraft("");
      setActiveRun(run);
      setRunEvents([]);
      setArtifacts([]);
      setSelectedArtifactId(undefined);
      await queryClient.invalidateQueries({ queryKey: ["messages", selectedChatId] });
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
    }
  });

  useEffect(() => {
    if (!activeRun) {
      return;
    }

    const source = new EventSource(`/api/runs/${activeRun.id}/events`);

    const handleEvent = (event: MessageEvent<string>) => {
      const runEvent = JSON.parse(event.data) as RunEvent;

      setRunEvents((current) => {
        if (current.some((item) => item.id === runEvent.id)) {
          return current;
        }

        return [...current, runEvent].sort((a, b) => a.sequence - b.sequence);
      });

      if (runEvent.payload?.artifact) {
        upsertArtifact(runEvent.payload.artifact);
      }

      if (runEvent.type === "run.completed" || runEvent.type === "run.failed") {
        setActiveRun((current) =>
          current?.id === runEvent.runId
            ? { ...current, status: runEvent.type === "run.completed" ? "completed" : "failed", updatedAt: runEvent.createdAt }
            : current
        );
        source.close();
        void queryClient.invalidateQueries({ queryKey: ["messages", activeRun.chatId] });
        void queryClient.invalidateQueries({ queryKey: ["chats"] });
      } else if (runEvent.type === "run.started") {
        setActiveRun((current) =>
          current?.id === runEvent.runId ? { ...current, status: "running", updatedAt: runEvent.createdAt } : current
        );
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

  const messages = messagesQuery.data ?? [];
  const activeChat = useMemo(() => chats.find((chat) => chat.id === selectedChatId), [chats, selectedChatId]);
  const selectedArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedArtifactId),
    [artifacts, selectedArtifactId]
  );
  const hasTaskActivity =
    messages.some((message) => message.role === "user") || Boolean(activeRun) || runEvents.length > 0;
  const showNewTaskComposer = !messagesQuery.isFetching && !hasTaskActivity;
  const isSendDisabled = !selectedChatId || sendMessageMutation.isPending;

  function selectChat(chatId: string) {
    setSelectedChatId(chatId);
    setActiveRun(undefined);
    setRunEvents([]);
    setArtifacts([]);
    setSelectedArtifactId(undefined);
  }

  function handleSubmit() {
    const content = draft.trim();

    if (!content || !selectedChatId || sendMessageMutation.isPending) {
      return;
    }

    sendMessageMutation.mutate(content);
  }

  function handleThemeChange(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
  }

  function upsertArtifact(nextArtifact: Artifact) {
    setArtifacts((current) => {
      const existingIndex = current.findIndex((artifact) => artifact.id === nextArtifact.id);

      if (existingIndex === -1) {
        return [...current, nextArtifact];
      }

      return current.map((artifact, index) => (index === existingIndex ? nextArtifact : artifact));
    });
  }

  if (pathname.startsWith("/debug/runs")) {
    return <DebugRunsPage theme={theme} />;
  }

  return (
    <main className="app-shell h-screen overflow-hidden text-foreground" data-theme={theme}>
      <div className="grid h-full grid-cols-[260px_minmax(0,1fr)] max-lg:grid-cols-1 max-lg:grid-rows-[220px_minmax(0,1fr)]">
        <SessionSidebar
          isCreating={createChatMutation.isPending}
          onCreateChat={() => createChatMutation.mutate()}
          onThemeChange={handleThemeChange}
          theme={theme}
        />

        {showNewTaskComposer ? (
          <NewTaskComposer
            draft={draft}
            isSending={isSendDisabled}
            onDraftChange={setDraft}
            onSubmit={handleSubmit}
          />
        ) : (
          <ResizablePanelGroup className="min-h-0" orientation="horizontal">
            <ResizablePanel defaultSize={56} minSize={38}>
              <AgentStream
                activeChat={activeChat}
                activeRun={activeRun}
                artifacts={artifacts}
                draft={draft}
                events={runEvents}
                isSending={isSendDisabled}
                messages={messages}
                onDraftChange={setDraft}
                onOpenArtifact={setSelectedArtifactId}
                onSubmit={handleSubmit}
                selectedArtifactId={selectedArtifactId}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={44} minSize={30}>
              <SandboxPanel
                activeRun={activeRun}
                events={runEvents}
                onCloseArtifact={() => setSelectedArtifactId(undefined)}
                selectedArtifact={selectedArtifact}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </main>
  );
}
