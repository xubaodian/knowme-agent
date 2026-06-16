import { Check, ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SkillOption } from "../../shared/types";
import { cn } from "../lib/utils";

type SkillPickerProps = {
  className?: string;
  onChange: (value: string) => void;
  selectedSkillName?: string;
  skills: SkillOption[];
};

export function SkillPicker({ className, onChange, selectedSkillName, skills }: SkillPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.name === selectedSkillName),
    [selectedSkillName, skills]
  );
  const isDisabled = skills.length === 0;
  const label = selectedSkill?.name ?? (isDisabled ? "No skills" : "Choose skill");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (target instanceof Node && !rootRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Selected skill"
        className="inline-flex h-9 max-w-48 items-center gap-2 rounded-md bg-muted/75 px-3 text-xs font-medium text-foreground shadow-[var(--shadow-soft)] outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50"
        disabled={isDisabled}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <Sparkles className="size-3.5 text-primary" />
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", isOpen ? "rotate-180" : "")} />
      </button>

      {isOpen ? (
        <div
          className="absolute bottom-full right-0 z-50 mb-2 w-72 overflow-hidden rounded-lg bg-popover/95 p-1 text-popover-foreground shadow-[0_18px_45px_rgba(0,0,0,0.22)] backdrop-blur-xl"
          role="listbox"
        >
          {skills.map((skill) => {
            const isSelected = skill.name === selectedSkillName;

            return (
              <button
                aria-selected={isSelected}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left outline-none transition hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring/55",
                  isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground"
                )}
                key={skill.name}
                onClick={() => {
                  onChange(skill.name);
                  setIsOpen(false);
                }}
                role="option"
                type="button"
              >
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                  {isSelected ? <Check className="size-3.5 text-primary" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-foreground">{skill.name}</span>
                  <span className="mt-0.5 block max-h-9 overflow-hidden text-[11px] leading-[18px] text-muted-foreground">
                    {skill.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
