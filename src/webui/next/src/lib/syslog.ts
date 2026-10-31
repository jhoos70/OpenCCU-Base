import type { LogItem, LogValue, SysVar } from "./api";
import type { Strings } from "./ccu-strings";
import { formatSysVarValue, text } from "./format";
import type { Translate } from "./i18n";

/** A recorded value as the status of a system variable would show it (the log records the same kinds of values). */
const asSysVar = (v: LogValue): SysVar => ({
  id: "",
  name: "",
  type: v.type,
  unit: v.unit,
  value: v.value,
  valueList: v.valueList,
  valueName0: v.valueName0,
  valueName1: v.valueName1,
  description: "",
  lastModified: "",
  isVisible: true,
  isInternal: false,
});

/** The "Activity" of an entry: its values written for the user, the values of one event joined by a comma (as the classic list). */
export const activityText = (item: LogItem, t: Translate, strings: Strings, lang: string): string =>
  item.values.map((v) => formatSysVarValue(asSysVar(v), t, strings, lang)).join(", ");

/** How many records the items stand for (the log pages by records, an item may hold several). */
export const recordsIn = (items: readonly LogItem[]): number => items.reduce((n, i) => n + i.values.length, 0);

/** Entries whose time, name or activity contains every word of the query (case-insensitive). */
export function filterLog(items: readonly LogItem[], query: string, activity: (i: LogItem) => string, name: (i: LogItem) => string): LogItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((i) => {
    const hay = `${i.time} ${name(i)} ${activity(i)}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The name of an entry: a system variable or a channel, which may be a ${key} reference. */
export const entryName = (item: LogItem, strings: Strings): string => text(item.name, strings);
