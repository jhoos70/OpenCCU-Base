// Texts that belong to the CCU, not to this app: the value names of system variables (stored as ${key}) and
// the descriptions of device types. The classic UI keeps them in language files; they are read from there,
// so both UIs show the same translations and nothing is translated twice. The files are
// /webui/js/lang/<lang>/translate.lang.<catalog>.js: a jQuery.extend(true, langJSON, {"de": {"key": "text"}})
// call with ISO-8859-1 percent escapes (%FC = ü). If a file cannot be read the caller falls back to plain text.

export type Catalog = "extension" | "stringtable" | "deviceDescription";
export type Strings = Record<string, string>;

const decode = (s: string): string =>
  s
    .replace(/%u([0-9A-Fa-f]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

/** Extracts the "key": "text" pairs of a language file (a value may sit on the next line). */
export function parseCatalog(source: string): Strings {
  const out: Strings = {};
  const pair = /"([^"\\]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  for (let m = pair.exec(source); m; m = pair.exec(source)) out[m[1]] = decode(m[2].replace(/\\(.)/g, "$1"));
  return out;
}

export function catalogUrl(lang: string, catalog: Catalog): string {
  return `/webui/js/lang/${lang}/translate.lang.${catalog}.js`;
}

type Fetch = typeof fetch;
const cache = new Map<string, Promise<Strings>>();

/** One catalog for one language; cached, and an unreadable file is an empty catalog. */
export function loadCatalog(lang: string, catalog: Catalog, doFetch: Fetch = (...a) => fetch(...a)): Promise<Strings> {
  const url = catalogUrl(lang, catalog);
  let p = cache.get(url);
  if (!p) {
    p = doFetch(url)
      .then((r) => (r.ok ? r.text() : ""))
      .then(parseCatalog)
      .catch(() => ({}));
    cache.set(url, p);
  }
  return p;
}

/** "${sysVarX}" -> the text of sysVarX, or undefined when it is not a key or unknown. */
export function resolveKey(text: string | undefined, strings: Strings): string | undefined {
  const m = /^\$\{(\w+)\}$/.exec(text ?? "");
  return m ? strings[m[1]] : undefined;
}

export const isKey = (text: string | undefined): boolean => /^\$\{\w+\}$/.test(text ?? "");
