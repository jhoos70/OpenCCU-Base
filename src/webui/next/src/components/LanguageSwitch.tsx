import { LANGS, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitch({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t("language")} className={cn("flex gap-1 text-xs", className)}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={cn("rounded px-1.5 py-0.5 font-medium uppercase", lang === l ? "bg-white/25 font-bold underline underline-offset-4" : "opacity-70 hover:opacity-100")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
