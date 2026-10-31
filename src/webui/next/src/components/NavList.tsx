import { useI18n } from "@/lib/i18n";
import type { NavView } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** The navigation entries of a user. The same list serves the sidebar and the drawer of narrow screens. */
export function NavList({ nav, current, classicHref, onNavigate }: { nav: NavView; current: string; classicHref: string; onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("navMain")} className="space-y-4 text-sm">
      {nav.groups.map((g) => (
        <div key={g.group}>
          <h2 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{t(g.group === "objects" ? "groupObjects" : "groupSystem")}</h2>
          <ul>
            {g.items.map((i) => (
              <li key={i.id}>
                <a
                  href={`#/${i.id}`}
                  onClick={onNavigate}
                  aria-current={current === i.id ? "page" : undefined}
                  className={cn("block rounded-md px-3 py-2 font-medium", current === i.id ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "hover:bg-white")}
                >
                  {t(i.labelKey)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {nav.hasMore && (
        <a href={classicHref} className="block px-3 py-2 text-[var(--muted-foreground)] underline">
          {t("moreInClassic")}
        </a>
      )}
    </nav>
  );
}
