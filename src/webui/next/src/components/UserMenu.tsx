import type { Profile } from "@/lib/api";
import { LANGS, useI18n, type Lang } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const LEVEL: Record<Profile["level"], MessageKey> = { ADMIN: "levelAdmin", USER: "levelUser", GUEST: "levelGuest", NONE: "levelNone" };

/** Who is signed in, the language, and the way out. The expert mode is shown only: the CCU has no API to change it. */
export function UserMenu({ profile, classicHref, onSignOut, busy }: { profile: Profile | null; classicHref: string; onSignOut: () => void; busy: boolean }) {
  const { t, lang, setLang } = useI18n();
  const name = profile?.firstName || profile?.userName || "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white" aria-label={t("userMenu")}>
        <span className="max-w-32 truncate">{name}</span>
        <span aria-hidden="true">▾</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {profile && (
          <>
            <DropdownMenuLabel>
              <div className="font-semibold">{name}</div>
              <div className="text-xs font-normal text-[var(--muted-foreground)]">
                {t(LEVEL[profile.level])} · {t(profile.isNoExpert ? "modeSimple" : "modeExpert")}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="py-0 text-xs text-[var(--muted-foreground)]">{t("language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as Lang)}>
          {LANGS.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l}>
              {l === "de" ? "Deutsch" : "English"}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {/* The classic UI takes the same session id, so both UIs run side by side. */}
        <DropdownMenuItem asChild>
          <a href={classicHref}>{t("openClassic")}</a>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={onSignOut}>
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
