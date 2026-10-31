import * as React from "react";
import { cn } from "@/lib/utils";

// Wrapped so a wide table scrolls inside the card instead of widening the page on a phone.
export const Table = ({ className, ...p }: React.ComponentProps<"table">) => (
  <div className="w-full overflow-x-auto">
    <table className={cn("w-full text-left text-sm", className)} {...p} />
  </div>
);
export const TableHead = (p: React.ComponentProps<"thead">) => <thead className="border-b border-[var(--border)] text-[var(--muted-foreground)]" {...p} />;
export const TableRow = ({ className, ...p }: React.ComponentProps<"tr">) => <tr className={cn("border-b border-[var(--border)] last:border-0", className)} {...p} />;
export const TableHeader = ({ className, ...p }: React.ComponentProps<"th">) => <th className={cn("px-3 py-2 font-medium", className)} {...p} />;
export const TableCell = ({ className, ...p }: React.ComponentProps<"td">) => <td className={cn("px-3 py-2 align-top", className)} {...p} />;
