import * as React from "react";
import type { Column, Table } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { useI18n } from "@/lib/i18n";

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const { t } = useI18n();

  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  const isSorted = column.getIsSorted();

  return (
    <div className={cn("flex items-center space-x-1", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-7 px-2 text-xs font-semibold hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
        onClick={() => column.toggleSorting(isSorted === "asc")}
        title={isSorted === "asc" ? t("sortDesc") : t("sortAsc")}
      >
        <span>{title}</span>
        {isSorted === "desc" ? (
          <ArrowDown className="ml-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : isSorted === "asc" ? (
          <ArrowUp className="ml-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-40 hover:opacity-100" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
  columnLabels?: Record<string, string>;
}

export function DataTableViewOptions<TData>({
  table,
  columnLabels = {},
}: DataTableViewOptionsProps<TData>) {
  const { t } = useI18n();

  const hideableColumns = table
    .getAllColumns()
    .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide());

  if (hideableColumns.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-medium">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t("columns")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-semibold text-[var(--muted-foreground)]">
          {t("toggleColumns")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hideableColumns.map((column) => {
          const label = columnLabels[column.id] || column.id;
          return (
            <DropdownMenuCheckboxItem
              key={column.id}
              className="text-xs"
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
            >
              {label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
