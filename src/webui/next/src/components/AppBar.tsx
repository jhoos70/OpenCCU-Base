import * as React from "react";
import { useI18n } from "@/lib/i18n";
import type { NavView } from "@/lib/nav";
import type { Profile } from "@/lib/api";
import { NavList } from "@/components/NavList";
import { StatusIndicators } from "@/components/StatusIndicators";
import { UserMenu } from "@/components/UserMenu";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** The slim bar on top: the menu button (narrow screens only), the name, and the user menu. Status indicators come here. */
export function AppBar({ profile, nav, current, classicHref, onSignOut, busy }: { profile: Profile | null; nav: NavView; current: string; classicHref: string; onSignOut: () => void; busy: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const hasNav = nav.groups.length > 0;
  return (
    <header className="bg-[var(--primary)] text-[var(--primary-foreground)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        {hasNav && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="rounded-md px-2 py-1.5 text-lg leading-none hover:bg-white/10 md:hidden" aria-label={t("menu")}>
              <span aria-hidden="true">☰</span>
            </SheetTrigger>
            <SheetContent className="text-[var(--foreground)]">
              <div className="mb-4 flex items-center justify-between">
                <SheetTitle className="font-semibold">{t("appName")}</SheetTitle>
                <SheetClose className="rounded px-2 py-1 hover:bg-[var(--background)]" aria-label={t("closeMenu")}>
                  <span aria-hidden="true">✕</span>
                </SheetClose>
              </div>
              <NavList nav={nav} current={current} classicHref={classicHref} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        )}
        <a href="#/" className="text-lg font-semibold">
          {t("appName")}
        </a>
        <div className="ml-auto flex items-center gap-1">
          <StatusIndicators />
          <UserMenu profile={profile} classicHref={classicHref} onSignOut={onSignOut} busy={busy} />
        </div>
      </div>
    </header>
  );
}
