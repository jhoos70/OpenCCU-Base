import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { canSee, NAV, type NavItem } from "@/lib/nav";
import type { Level } from "@/lib/api";
import type { NavCustomConfig } from "@/lib/nav-order";
import { NAV_ICONS } from "./NavList";
import { cn } from "@/lib/utils";

export function NavCustomizeDialog({
  open,
  onClose,
  level,
  custom,
  onMoveItem,
  onToggleHide,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  level: Level;
  custom: NavCustomConfig | null;
  onMoveItem: (availableIds: string[], id: string, delta: -1 | 1) => void;
  onToggleHide: (id: string, availableIds: string[]) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();

  // Get all ready items the user is permitted to see
  const availableItems = React.useMemo(() => {
    return NAV.filter((i): i is NavItem & { ready: true } => canSee(i, level) && i.ready);
  }, [level]);

  const availableIds = React.useMemo(() => availableItems.map((i) => i.id), [availableItems]);

  // Order items based on custom order (if set)
  const orderedItems = React.useMemo(() => {
    const list = [...availableItems];
    if (custom?.order && custom.order.length > 0) {
      const orderMap = new Map(custom.order.map((id, idx) => [id, idx]));
      list.sort((a, b) => {
        const aIdx = orderMap.has(a.id) ? orderMap.get(a.id)! : 999;
        const bIdx = orderMap.has(b.id) ? orderMap.get(b.id)! : 999;
        return aIdx - bIdx;
      });
    }
    return list;
  }, [availableItems, custom?.order]);

  const hiddenSet = React.useMemo(() => new Set(custom?.hidden ?? []), [custom?.hidden]);
  const isCustomized = custom !== null;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-xl bg-[var(--card)] text-[var(--foreground)] shadow-xl border border-[var(--border)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <SlidersHorizontal className="size-4" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold">
                  {t("customizeNav")}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-[var(--muted-foreground)]">
                  {t("customizeNavDesc")}
                </Dialog.Description>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              aria-label={t("closeMenu")}
            >
              <X className="size-4" />
            </button>
          </div>

          {/* List of reorderable / toggleable items */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
            {orderedItems.map((item, idx) => {
              const Icon = NAV_ICONS[item.id];
              const isHidden = hiddenSet.has(item.id);
              const isProtected = item.id === "overview";

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                    isHidden
                      ? "border-dashed border-[var(--border)] bg-[var(--muted)]/30 opacity-60"
                      : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]/40",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {Icon && <Icon className="size-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />}
                    <span className="font-medium truncate">{t(item.labelKey)}</span>
                    {isHidden && (
                      <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--muted-foreground)]">
                        {t("hiddenBadge")}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Move Up */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="size-7 p-0"
                      disabled={idx === 0}
                      onClick={() => onMoveItem(availableIds, item.id, -1)}
                      aria-label={`${t("moveUpItem")}: ${t(item.labelKey)}`}
                      title={t("moveUpItem")}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>

                    {/* Move Down */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="size-7 p-0"
                      disabled={idx === orderedItems.length - 1}
                      onClick={() => onMoveItem(availableIds, item.id, 1)}
                      aria-label={`${t("moveDownItem")}: ${t(item.labelKey)}`}
                      title={t("moveDownItem")}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>

                    {/* Visibility toggle */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn("size-7 p-0", isHidden && "text-[var(--muted-foreground)]")}
                      disabled={isProtected}
                      onClick={() => onToggleHide(item.id, availableIds)}
                      aria-label={isProtected ? t("cannotHideOverview") : isHidden ? t("showItem") : t("hideItem")}
                      title={isProtected ? t("cannotHideOverview") : isHidden ? t("showItem") : t("hideItem")}
                    >
                      {isHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3 bg-[var(--muted)]/20">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReset}
              disabled={!isCustomized}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className="size-3.5" />
              <span>{t("resetDefaultNav")}</span>
            </Button>

            <Button type="button" size="sm" onClick={onClose} className="px-4 text-xs font-semibold">
              {t("done")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
