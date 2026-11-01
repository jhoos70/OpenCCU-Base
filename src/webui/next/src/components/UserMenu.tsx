import { ChevronDown, ExternalLink, Languages, Laptop, LogOut, Moon, ShieldCheck, Sun, User } from "lucide-react";
import type { Profile } from "@/lib/api";
import { LANGS, useI18n, type Lang } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { type Theme, useTheme } from "@/lib/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LEVEL: Record<Profile["level"], MessageKey> = {
  ADMIN: "levelAdmin",
  USER: "levelUser",
  GUEST: "levelGuest",
  NONE: "levelNone",
};

/** Who is signed in, the language, and the way out. */
export function UserMenu({
  profile,
  classicHref,
  onSignOut,
  busy,
}: {
  profile: Profile | null;
  classicHref: string;
  onSignOut: () => void;
  busy: boolean;
}) {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const name = profile?.firstName || profile?.userName || "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-1.5 sm:px-2.5 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
        aria-label={t("userMenu")}
      >
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)] font-semibold text-xs">
          {name ? name.charAt(0).toUpperCase() : <User className="size-3.5" />}
        </div>
        <span className="hidden sm:inline max-w-28 truncate">{name}</span>
        <ChevronDown className="size-3.5 text-[var(--muted-foreground)] opacity-70 hidden sm:block" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {profile && (
          <>
            <DropdownMenuLabel>
              <div className="font-semibold text-sm">{name}</div>
              <div className="flex items-center gap-1.5 pt-0.5 text-xs font-normal text-[var(--muted-foreground)]">
                <ShieldCheck className="size-3.5 text-[var(--accent)]" />
                <span>{t(LEVEL[profile.level])}</span>
                <span>·</span>
                <span>{t(profile.isNoExpert ? "modeSimple" : "modeExpert")}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="flex items-center gap-1.5 py-1 text-xs text-[var(--muted-foreground)]">
          <Languages className="size-3.5" />
          <span>{t("language")}</span>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as Lang)}>
          {LANGS.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l}>
              {l === "de" ? "Deutsch" : "English"}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5 py-1 text-xs text-[var(--muted-foreground)]">
          <Sun className="size-3.5" />
          <span>{t("theme")}</span>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <DropdownMenuRadioItem value="light" className="gap-2">
            <Sun className="size-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
            <span>{t("themeLight")}</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="gap-2">
            <Moon className="size-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
            <span>{t("themeDark")}</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="gap-2">
            <Laptop className="size-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
            <span>{t("themeSystem")}</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={classicHref} className="flex items-center justify-between">
            <span>{t("openClassic")}</span>
            <ExternalLink className="size-3.5 text-[var(--muted-foreground)]" />
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={onSignOut} className="text-[var(--destructive)] focus:text-[var(--destructive)]">
          <div className="flex items-center gap-2">
            <LogOut className="size-3.5" />
            <span>{t("signOut")}</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
