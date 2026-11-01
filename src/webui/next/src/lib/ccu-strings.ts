// Texts that belong to the CCU, not to this app: the value names of system variables (stored as ${key}) and
// the descriptions of device types. The classic UI keeps them in language files; they are read from there,
// so both UIs show the same translations and nothing is translated twice. The files are
// /webui/js/lang/<lang>/translate.lang.<catalog>.js: a jQuery.extend(true, langJSON, {"de": {"key": "text"}})
// call with ISO-8859-1 percent escapes (%FC = ü). If a file cannot be read the caller falls back to plain text.

export type Catalog = "base" | "extension" | "stringtable" | "deviceDescription" | "group";
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
  return catalog === "base" ? `/webui/js/lang/${lang}/translate.lang.js` : `/webui/js/lang/${lang}/translate.lang.${catalog}.js`;
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

export const DEV_DESCR_URL = "/tools/js/jsDevDescr.cgi";

/** Extracts the 50 px thumbnail path per device type from /tools/js/jsDevDescr.cgi (DEV_PATHS["type"]["50"] = "/config/img/..."). */
export function parseDeviceIcons(source: string): Strings {
  const out: Strings = {};
  const entry = /DEV_PATHS\["([^"\\]+)"\]\["50"\]\s*=\s*"([^"\\]+)"/g;
  for (let m = entry.exec(source); m; m = entry.exec(source)) {
    out[m[1]] = m[2];
    out[m[1].toLowerCase()] ??= m[2];
  }
  return out;
}

export const deviceIcon = (type: string, icons: Strings): string | undefined => icons[type] ?? icons[type.toLowerCase()];

let iconCache: Promise<Strings> | undefined;

/** The 50 px device icon map from /tools/js/jsDevDescr.cgi; cached, and an unreadable response is an empty map. */
export function loadDeviceIcons(doFetch: Fetch = (...a) => fetch(...a)): Promise<Strings> {
  if (!iconCache) {
    iconCache = doFetch(DEV_DESCR_URL)
      .then((r) => (r.ok ? r.text() : ""))
      .then(parseDeviceIcons)
      .catch(() => ({}));
  }
  return iconCache;
}
