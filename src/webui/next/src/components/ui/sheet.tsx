import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

// A drawer from the left, for the navigation on narrow screens. Radix handles focus trap, Escape and aria.
export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;
export const SheetTitle = D.Title;

export interface SheetContentProps extends React.ComponentProps<typeof D.Content> {
  side?: "left" | "right";
}

export function SheetContent({ className, side = "left", children, ...p }: SheetContentProps) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity" />
      <D.Content
        aria-describedby={undefined}
        className={cn(
          "fixed inset-y-0 z-50 overflow-y-auto bg-[var(--card)] text-[var(--foreground)] shadow-xl transition-all",
          side === "left" && "left-0 w-72 max-w-[85vw] p-4",
          side === "right" && "right-0 w-full sm:max-w-xl md:max-w-2xl border-l border-[var(--border)] p-6",
          className,
        )}
        {...p}
      >
        {children}
      </D.Content>
    </D.Portal>
  );
}
