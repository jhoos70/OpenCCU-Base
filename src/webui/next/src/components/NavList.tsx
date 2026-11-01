import * as React from "react";
import {
  LayoutDashboard,
  Radio,
  DoorOpen,
  Wrench,
  PlayCircle,
  Variable,
  Star,
  ScrollText,
  Flame,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { NavView } from "@/lib/nav";
import { cn } from "@/lib/utils";

export const NAV_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  devices: Radio,
  rooms: DoorOpen,
  functions: Wrench,
  programs: PlayCircle,
  sysvars: Variable,
  favourites: Star,
  groups: Flame,
  log: ScrollText,
};

/** The navigation entries of a user. The same list serves the sidebar and the drawer of narrow screens. */
export function NavList({
  nav,
  current,
  classicHref,
  onNavigate,
  collapsed = false,
}: {
  nav: NavView;
  current: string;
  classicHref: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("navMain")} className="space-y-4 text-sm">
      {nav.groups.map((g) => (
        <div key={g.group} className="space-y-1">
          <h2
            className={cn(
              "px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]",
              collapsed && "sr-only",
            )}
          >
            {t(g.group === "objects" ? "groupObjects" : "groupSystem")}
          </h2>
          <ul className="space-y-1">
            {g.items.map((i) => {
              const Icon = NAV_ICONS[i.id];
              const active = current === i.id;
              return (
                <li key={i.id}>
                  <a
                    href={`#/${i.id}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? t(i.labelKey) : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 font-medium transition-colors",
                      active
                        ? "bg-[var(--primary)] text-white shadow-sm"
                        : "text-[var(--foreground)] hover:bg-[var(--muted)]",
                      collapsed && "justify-center px-2",
                    )}
                  >
                    {Icon && (
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-transform group-hover:scale-110",
                          active ? "text-white" : "text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]",
                        )}
                        aria-hidden="true"
                      />
                    )}
                    <span className={cn("truncate", collapsed && "sr-only")}>{t(i.labelKey)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {nav.hasMore && (
        <div className="pt-2">
          <a
            href={classicHref}
            title={collapsed ? t("moreInClassic") : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors",
              collapsed && "justify-center px-2",
            )}
          >
            <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
            <span className={cn("truncate underline", collapsed && "sr-only")}>{t("moreInClassic")}</span>
          </a>
        </div>
      )}
    </nav>
  );
}
