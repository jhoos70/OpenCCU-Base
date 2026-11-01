import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

// A drawer from the left, for the navigation on narrow screens. Radix handles focus trap, Escape and aria.
export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;
export const SheetTitle = D.Title;

export function SheetContent({ className, children, ...p }: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs" />
      <D.Content aria-describedby={undefined} className={cn("fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto bg-[var(--card)] text-[var(--foreground)] p-4 shadow-lg", className)} {...p}>
        {children}
      </D.Content>
    </D.Portal>
  );
}
