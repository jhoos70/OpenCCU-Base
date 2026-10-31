import * as React from "react";
import { de, en, type MessageKey } from "./messages";

export type Lang = "en" | "de";
export const LANGS: readonly Lang[] = ["de", "en"];
export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

const catalogs: Record<Lang, Record<MessageKey, string>> = { en, de };
const KEY = "openccu.next.lang";

export function translate(lang: Lang, key: MessageKey, params: Params = {}): string {
  return catalogs[lang][key].replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** The stored choice wins; otherwise the browser language (German for de*, else English). */
export function detectLang(browser: string | undefined, stored: string | null): Lang {
  if (stored === "de" || stored === "en") return stored;
  return (browser ?? "").toLowerCase().startsWith("de") ? "de" : "en";
}

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked: the browser language decides
  }
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translate;
}
const Ctx = React.createContext<I18n>({ lang: "en", setLang: () => {}, t: (k, p) => translate("en", k, p) });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(() => detectLang(navigator.language, readStored()));
  React.useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = React.useMemo<I18n>(
    () => ({
      lang,
      setLang: (l) => {
        try {
          localStorage.setItem(KEY, l);
        } catch {
          /* the choice lasts until reload */
        }
        setLangState(l);
      },
      t: (key, params) => translate(lang, key, params),
    }),
    [lang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = (): I18n => React.useContext(Ctx);
