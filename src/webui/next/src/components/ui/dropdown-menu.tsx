import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuRadioGroup = M.RadioGroup;

export function DropdownMenuContent({ className, sideOffset = 6, ...p }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={sideOffset}
        align="end"
        className={cn("z-50 min-w-56 rounded-md border border-[var(--border)] bg-white p-1 text-sm text-[var(--foreground)] shadow-md", className)}
        {...p}
      />
    </M.Portal>
  );
}

const item = "flex cursor-default items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-[var(--background)]";
export const DropdownMenuItem = ({ className, ...p }: React.ComponentProps<typeof M.Item>) => <M.Item className={cn(item, className)} {...p} />;
export const DropdownMenuSeparator = (p: React.ComponentProps<typeof M.Separator>) => <M.Separator className="my-1 h-px bg-[var(--border)]" {...p} />;
export const DropdownMenuLabel = ({ className, ...p }: React.ComponentProps<typeof M.Label>) => <M.Label className={cn("px-2 py-1.5", className)} {...p} />;
export function DropdownMenuRadioItem({ className, children, ...p }: React.ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(item, "pl-7 data-[state=checked]:font-semibold", className)} {...p}>
      <M.ItemIndicator className="absolute left-2" aria-hidden="true">
        ✓
      </M.ItemIndicator>
      {children}
    </M.RadioItem>
  );
}
