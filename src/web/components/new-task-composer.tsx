import { Paperclip, Send } from "lucide-react";
import type { FormEvent } from "react";
import type { LlmModelOption, SkillOption } from "../../shared/types";
import { ModelPicker } from "./model-picker";
import { SkillPicker } from "./skill-picker";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export function NewTaskComposer({
  draft,
  isSending,
  models,
  onDraftChange,
  onModelChange,
  onSkillChange,
  onSubmit,
  selectedModel,
  selectedSkillName,
  skills
}: {
  draft: string;
  isSending: boolean;
  models: LlmModelOption[];
  onDraftChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSkillChange: (value: string) => void;
  onSubmit: () => void;
  selectedModel?: string;
  selectedSkillName?: string;
  skills: SkillOption[];
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-workspace">
      <div className="flex flex-1 items-center justify-center px-5 py-6 sm:px-8">
        <form
          aria-label="New task composer"
          className="glass-strong relative w-full max-w-3xl rounded-lg p-3"
          onSubmit={handleSubmit}
        >
          <Textarea
            aria-label="Message"
            className="max-h-64 min-h-40 resize-none bg-transparent px-4 pb-16 pt-5 text-base shadow-none focus-visible:ring-0"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="描述你想让 knowme-agent 完成的任务"
            rows={4}
            value={draft}
          />

          <div className="absolute inset-x-5 bottom-5 flex items-center justify-between gap-3">
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
      </div>
    </section>
  );
}
