import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--primary)]",
        className,
      )}
      {...props}
    />
  );
}
