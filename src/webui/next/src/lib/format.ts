import type { SysVar } from "./api";
import { isKey, resolveKey, type Strings } from "./ccu-strings";
import type { Translate } from "./i18n";

/** Is this variable part of the user's own set (the classic list hides internal ones)? */
export const isUserVar = (v: SysVar): boolean => v.isVisible && !v.isInternal;

// ReGa stores the texts of a logic variable as value names; they may be ${key} references that the classic UI
// resolves with its string table (ccu-strings.ts). A key that is not (yet) known is not shown raw.
const named = (name: string | undefined, fallback: string, strings: Strings): string => {
  if (!name) return fallback;
  return isKey(name) ? (resolveKey(name, strings) ?? fallback) : name;
};

/** A text with ${key} references anywhere in it ("${unknownMessage} (HM-X|UNREACH)"): known keys are replaced, unknown ones stay. */
export const expand = (s: string, strings: Strings): string => s.replace(/\$\{(\w+)\}/g, (m, key: string) => strings[key] ?? m);

/** A name or description that may itself be a ${key}. */
export const text = (s: string, strings: Strings): string => (isKey(s) ? (resolveKey(s, strings) ?? s) : s);

export function formatSysVarValue(v: SysVar, t: Translate, strings: Strings = {}): string {
  switch (v.type) {
    case "LOGIC":
      return v.value === "true" ? named(v.valueName1, t("yes"), strings) : named(v.valueName0, t("no"), strings);
    case "ALARM":
      return v.value === "true" ? named(v.valueName1, t("triggered"), strings) : named(v.valueName0, t("notTriggered"), strings);
    case "ENUM": {
      const list = (v.valueList ?? "").split(";");
      return list[Number(v.value)] ?? v.value;
    }
    case "NUMBER":
      return v.unit ? `${v.value} ${v.unit}` : v.value;
    default:
      return v.value;
  }
}
