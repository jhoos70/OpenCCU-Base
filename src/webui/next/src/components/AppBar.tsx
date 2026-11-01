import * as React from "react";
import { Menu, PanelLeft, PanelLeftClose, Radio, Search, SlidersHorizontal, X } from "lucide-react";
import { OpenCCULogo } from "@/components/OpenCCULogo";
import { useI18n } from "@/lib/i18n";
import type { NavView } from "@/lib/nav";
import type { Profile } from "@/lib/api";
import { NavList, NAV_ICONS } from "@/components/NavList";
import { StatusIndicators } from "@/components/StatusIndicators";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** The slim top bar: mobile menu trigger, sidebar collapse toggle, active page breadcrumb, alerts and user menu. */
export function AppBar({
  profile,
  nav,
  current,
  classicHref,
  onSignOut,
  busy,
  collapsed = false,
  onToggleCollapse,
  onOpenCommand,
  onOpenCustomize,
}: {
  profile: Profile | null;
  nav: NavView;
  current: string;
  classicHref: string;
  onSignOut: () => void;
  busy: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenCommand?: () => void;
  onOpenCustomize?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const hasNav = nav.groups.length > 0;

  const activeItem = nav.groups.flatMap((g) => g.items).find((i) => i.id === current);
  const currentTitle = activeItem
    ? t(activeItem.labelKey)
    : current === "alarms"
      ? t("alarmMessages")
      : current === "services"
        ? t("serviceMessages")
        : t("appName");
  const CurrentIcon = NAV_ICONS[current] ?? Radio;

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/95 px-3 sm:px-4 backdrop-blur shadow-xs">
      <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial">
        {/* Mobile menu trigger */}
        {hasNav && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="flex size-9 items-center justify-center rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors md:hidden"
              aria-label={t("menu")}
            >
              <Menu className="size-5" aria-hidden="true" />
            </SheetTrigger>
            <SheetContent className="flex w-72 flex-col p-0 text-[var(--foreground)]">
              <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-4">
                <SheetTitle className="flex items-center gap-2 text-sm font-bold">
                  <OpenCCULogo className="size-7" />
                  <span>OpenCCU</span>
                </SheetTitle>
                <SheetClose
                  className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  aria-label={t("closeMenu")}
                >
                  <X className="size-4" aria-hidden="true" />
                </SheetClose>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <NavList nav={nav} current={current} classicHref={classicHref} onNavigate={() => setOpen(false)} />
              </div>
              {onOpenCustomize && (
                <div className="border-t border-[var(--border)] p-3">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenCustomize();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg p-2 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
                    <span>{t("customizeNav")}</span>
                  </button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        )}

        {/* Desktop sidebar toggle button */}
        {hasNav && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={t(collapsed ? "expandSidebar" : "collapseSidebar")}
            title={t(collapsed ? "expandSidebar" : "collapseSidebar")}
            className="hidden md:flex size-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            {collapsed ? <PanelLeft className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
          </button>
        )}

        {/* Vertical divider */}
        {hasNav && <div className="mx-1 hidden h-4 w-px bg-[var(--border)] md:block" />}

        {/* Breadcrumb / Current page title */}
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)] min-w-0">
          <CurrentIcon className="size-4 text-[var(--primary)] shrink-0 hidden sm:block" aria-hidden="true" />
          <span className="truncate">{currentTitle}</span>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {onOpenCommand && (
          <button
            type="button"
            onClick={onOpenCommand}
            aria-label={t("search")}
            title={`${t("search")} (⌘K / Ctrl+K)`}
            className="flex size-8 md:h-8 md:w-auto items-center justify-center md:justify-start gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-0 md:px-2.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]"
          >
            <Search className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden md:inline">{t("searchPrompt")}</span>
            <kbd className="pointer-events-none hidden md:inline-flex h-4.5 select-none items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--card)] px-1 font-mono text-[10px] font-medium text-[var(--muted-foreground)]">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        )}
        <StatusIndicators />
        <ThemeToggle className="size-8" />
        <div className="h-4 w-px bg-[var(--border)]" />
        <UserMenu
          profile={profile}
          classicHref={classicHref}
          onSignOut={onSignOut}
          busy={busy}
          onOpenCustomizeNav={onOpenCustomize}
        />
      </div>
    </header>
  );
}
