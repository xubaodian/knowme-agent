import { Bot, Check, MessageSquarePlus, Moon, Search, Settings2, Sun, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { ThemeMode } from "../lib/theme";
import { Button } from "./ui/button";

export function SessionSidebar({
  isCreating,
  onCreateChat,
  onThemeChange,
  theme
}: {
  isCreating: boolean;
  onCreateChat: () => void;
  onThemeChange: (theme: ThemeMode) => void;
  theme: ThemeMode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <aside className="relative flex min-h-0 flex-col bg-sidebar backdrop-blur-xl">
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 place-items-center rounded-md bg-primary/15 text-primary shadow-[0_10px_28px_rgba(37,208,186,0.12)]">
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
        <Button className="w-full justify-start" disabled={isCreating} onClick={onCreateChat} type="button">
          <MessageSquarePlus className="size-4" />
          新建任务
        </Button>
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
      </div>
    </aside>
  );
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
        isSelected ? "bg-primary/15 text-foreground shadow-[0_10px_24px_rgba(37,208,186,0.1)]" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
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
