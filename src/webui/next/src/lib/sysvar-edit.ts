// Changing a system variable: which ones may be changed here, what the dialog offers, what is checked before the
// request (the server checks again and is the authority; see www/api/v2/sysvars.tcl) and what is sent.
import type { SysVar, SysVarValue } from "./api";
import { isKey, resolveKey, type Strings } from "./ccu-strings";
import type { Translate } from "./i18n";
import type { MessageKey } from "./messages";

export const STRING_MAX = 1000;

/** Logic, list, number and string variables of the user's kind; not alarms, not the system's own. */
export const isEditable = (v: SysVar): boolean => ["LOGIC", "LIST", "NUMBER", "STRING"].includes(v.type) && v.isVisible && !v.isInternal;

export interface Choice {
  value: string; // what the form holds and the request sends ("true"/"false" or the list index)
  label: string;
}

const named = (name: string | undefined, fallback: string, strings: Strings): string => {
  if (!name) return fallback;
  return isKey(name) ? (resolveKey(name, strings) ?? fallback) : name;
};

/** The entries of a logic or a list variable, as the status shows them. */
export function choices(v: SysVar, t: Translate, strings: Strings): Choice[] {
  if (v.type === "LOGIC") {
    return [
      { value: "false", label: named(v.valueName0, t("no"), strings) },
      { value: "true", label: named(v.valueName1, t("yes"), strings) },
    ];
  }
  if (v.type === "LIST") return (v.valueList ?? "").split(";").map((label, i) => ({ value: String(i), label }));
  return [];
}

/** What the form starts with: the current value (a list's index, a logic variable's "true"/"false"). */
export const initialInput = (v: SysVar): string => (v.type === "NUMBER" ? String(Number(v.value)) : v.value);

const num = (s: string | undefined): number | null => (s !== undefined && s.trim() !== "" && Number.isFinite(Number(s)) ? Number(s) : null);

/** The number range of a variable (a limit it does not have is null). */
export const numberRange = (v: SysVar): { min: number | null; max: number | null } => ({ min: num(v.minValue), max: num(v.maxValue) });

/** The message key of what is wrong with the input, or null if it can be sent. */
export function validateInput(v: SysVar, input: string): { key: MessageKey; params?: Record<string, number> } | null {
  switch (v.type) {
    case "NUMBER": {
      if (!/^-?\d{1,15}(\.\d{1,15})?$/.test(input.trim())) return { key: "errNotAnumber" };
      const n = Number(input);
      const { min, max } = numberRange(v);
      if ((min !== null && n < min) || (max !== null && n > max)) return { key: "errOutOfRange" };
      return null;
    }
    case "STRING":
      return input.length > STRING_MAX ? { key: "errTooLong", params: { max: STRING_MAX } } : null;
    case "LOGIC":
      return input === "true" || input === "false" ? null : { key: "errInvalidValue" };
    case "LIST":
      return /^\d{1,4}$/.test(input) && Number(input) < (v.valueList ?? "").split(";").length ? null : { key: "errInvalidValue" };
    default:
      return { key: "errInvalidValue" };
  }
}

/** Has the user changed anything? (Saving the same value would only touch the time of the last change.) */
export const isChanged = (v: SysVar, input: string): boolean =>
  v.type === "NUMBER" ? num(input) !== num(v.value) : input !== v.value;

/** The value for the request: a boolean for a logic variable, else the text as typed (no float round trip). */
export const toRequestValue = (v: SysVar, input: string): SysVarValue => (v.type === "LOGIC" ? input === "true" : input.trim());
