import * as React from "react";
import { Menu, PanelLeft, PanelLeftClose, Radio, X } from "lucide-react";
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
}: {
  profile: Profile | null;
  nav: NavView;
  current: string;
  classicHref: string;
  onSignOut: () => void;
  busy: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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
      <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <CurrentIcon className="size-4 text-[var(--primary)] shrink-0 hidden sm:block" aria-hidden="true" />
          <span className="truncate">{currentTitle}</span>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 sm:gap-2">
        <StatusIndicators />
        <ThemeToggle className="size-8" />
        <div className="h-4 w-px bg-[var(--border)]" />
        <UserMenu profile={profile} classicHref={classicHref} onSignOut={onSignOut} busy={busy} />
      </div>
    </header>
  );
}
