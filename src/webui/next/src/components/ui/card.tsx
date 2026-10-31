import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm", className)} {...p} />
);
/** The page title is an h1; a card inside a page uses as="h2". */
export const CardTitle = ({ className, as: Tag = "h1", ...p }: React.ComponentProps<"h1"> & { as?: "h1" | "h2" }) => <Tag className={cn("text-xl font-semibold", className)} {...p} />;
export const CardDescription = ({ className, ...p }: React.ComponentProps<"p">) => (
  <p className={cn("text-sm text-[var(--muted-foreground)]", className)} {...p} />
);
