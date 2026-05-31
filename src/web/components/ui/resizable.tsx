import { GripVertical } from "lucide-react";
import type * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";
import { cn } from "../../lib/utils";

export const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => (
  <ResizablePrimitive.Group className={cn("flex size-full", className)} {...props} />
);

export const ResizablePanel = ResizablePrimitive.Panel;

export const ResizableHandle = ({
  withHandle = true,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & { withHandle?: boolean }) => (
  <ResizablePrimitive.Separator
    className={cn(
      "relative flex w-px items-center justify-center bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      className
    )}
    {...props}
  >
    {withHandle ? (
      <div className="glass-panel z-10 flex h-8 w-5 items-center justify-center rounded-md text-muted-foreground">
        <GripVertical className="size-3.5" />
      </div>
    ) : null}
  </ResizablePrimitive.Separator>
);
