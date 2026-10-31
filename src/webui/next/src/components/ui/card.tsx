import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm", className)} {...p} />
);
export const CardTitle = ({ className, ...p }: React.ComponentProps<"h1">) => <h1 className={cn("text-xl font-semibold", className)} {...p} />;
export const CardDescription = ({ className, ...p }: React.ComponentProps<"p">) => (
  <p className={cn("text-sm text-[var(--muted-foreground)]", className)} {...p} />
);
