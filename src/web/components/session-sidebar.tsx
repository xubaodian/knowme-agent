import { Activity, Bot, Check, MessageSquarePlus, Moon, Search, Settings2, Sun, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { ChatSession } from "../../shared/types";
import type { ThemeMode } from "../lib/theme";
import { Button } from "./ui/button";

export function SessionSidebar({
  chats,
  isNewTaskActive,
  onNewTask,
  onSelectChat,
  onThemeChange,
  selectedChatId,
  theme
}: {
  chats: ChatSession[];
  isNewTaskActive: boolean;
  onNewTask: () => void;
  onSelectChat: (chatId: string) => void;
  onThemeChange: (theme: ThemeMode) => void;
  selectedChatId?: string;
  theme: ThemeMode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <aside className="relative flex min-h-0 flex-col bg-sidebar max-lg:hidden">
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">knowme-agent</h1>
            <p className="text-xs text-muted-foreground">Agent workspace</p>
          </div>
        </div>
        <Button size="icon" type="button" variant="ghost">
          <Search className="size-4" />
        </Button>
      </div>

      <div className="space-y-4 px-3">
        <Button
          className="w-full justify-start"
          onClick={onNewTask}
          type="button"
          variant={isNewTaskActive ? "default" : "secondary"}
        >
          <MessageSquarePlus className="size-4" />
          新建任务
        </Button>
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3">
        <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">历史任务</div>
        <div className="space-y-1.5">
          {chats.length === 0 ? (
            <p className="px-1 py-2 text-xs leading-5 text-muted-foreground">暂无会话。</p>
          ) : (
            chats.map((chat) => (
              <button
                className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                  chat.id === selectedChatId
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                }`}
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                type="button"
              >
                <span className="block truncate text-sm font-medium">{chat.title}</span>
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">{formatChatTime(chat.updatedAt)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="mt-auto px-3 pb-4">
        {settingsOpen ? (
          <div className="glass-strong mb-3 rounded-lg p-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">设置</p>
                <p className="text-xs text-muted-foreground">界面偏好</p>
              </div>
              <Button onClick={() => setSettingsOpen(false)} size="icon" title="关闭设置" type="button" variant="ghost">
                <X className="size-4" />
              </Button>
            </div>

            <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">主题</p>
            <div className="grid gap-2">
              <ThemeOption
                icon={<Sun className="size-4" />}
                isSelected={theme === "light"}
                label="亮色"
                onClick={() => onThemeChange("light")}
              />
              <ThemeOption
                icon={<Moon className="size-4" />}
                isSelected={theme === "dark"}
                label="黑暗"
                onClick={() => onThemeChange("dark")}
              />
            </div>
          </div>
        ) : null}

        <Button
          aria-expanded={settingsOpen}
          className="w-full justify-start"
          onClick={() => setSettingsOpen((current) => !current)}
          type="button"
          variant="ghost"
        >
          <Settings2 className="size-4" />
          设置
        </Button>
        <Button asChild className="mt-2 w-full justify-start" variant="ghost">
          <a href="/debug/runs">
            <Activity className="size-4" />
            运行日志
          </a>
        </Button>
      </div>
    </aside>
  );
}

function formatChatTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function ThemeOption({
  icon,
  isSelected,
  label,
  onClick
}: {
  icon: ReactNode;
  isSelected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex h-10 items-center justify-between rounded-md px-3 text-sm transition-colors ${
        isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      {isSelected ? <Check className="size-4 text-primary" /> : null}
    </button>
  );
}
