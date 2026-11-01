import * as React from "react";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { OpenCCULogo } from "./OpenCCULogo";
import { useI18n } from "@/lib/i18n";
import type { NavView } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavList } from "./NavList";

export function AppSidebar({
  nav,
  current,
  classicHref,
  collapsed,
  onToggleCollapse,
}: {
  nav: NavView;
  current: string;
  classicHref: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { t } = useI18n();

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col shrink-0 border-r border-[var(--border)] bg-[var(--card)] transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Brand Header */}
      <div className="flex h-14 items-center border-b border-[var(--border)] px-3">
        <a
          href="#/overview"
          className={cn(
            "flex items-center gap-2.5 overflow-hidden font-semibold transition-colors hover:opacity-80",
            collapsed && "mx-auto justify-center",
          )}
          title={t("appName")}
        >
          <OpenCCULogo className="size-8" />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-tight text-[var(--foreground)]">OpenCCU</span>
              <span className="text-[11px] font-normal text-[var(--muted-foreground)]">NextGen WebUI</span>
            </div>
          )}
        </a>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-3">
        <NavList nav={nav} current={current} classicHref={classicHref} collapsed={collapsed} />
      </div>

      {/* Footer Collapse Toggle */}
      <div className="border-t border-[var(--border)] p-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          title={t(collapsed ? "expandSidebar" : "collapseSidebar")}
          aria-label={t(collapsed ? "expandSidebar" : "collapseSidebar")}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg p-2 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeft className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="size-4 shrink-0" aria-hidden="true" />
              <span>{t("collapseSidebar")}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
