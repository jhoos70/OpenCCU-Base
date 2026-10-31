// Operating the datapoints of a device: how a value is shown, which control a datapoint gets, what is checked before
// the request (the server checks again and is the authority; see www/api/v2/values.tcl) and what is sent.
import type { Datapoint } from "./api";
import type { Translate } from "./i18n";
import type { MessageKey } from "./messages";

export const STRING_MAX = 1000;

/** A device that never reported a value has the epoch as the time (and a default value that means nothing). */
export const neverReported = (dp: Datapoint): boolean => dp.timestamp.startsWith("1970-");

const num = (s: string): number | null => (s.trim() !== "" && Number.isFinite(Number(s)) ? Number(s) : null);

/** The entries of a list datapoint (the value is the index). */
export const listEntries = (dp: Datapoint): string[] => (dp.valueList === "" ? [] : dp.valueList.split(";"));

/** The value as a person reads it: the list entry, the number with its unit, yes or no. "" for a button. */
export function formatDatapoint(dp: Datapoint, t: Translate, lang: string): string {
  if (dp.type === "ACTION") return "";
  if (neverReported(dp)) return "";
  switch (dp.type) {
    case "LOGIC":
      return dp.value === "true" ? t("yes") : t("no");
    case "LIST":
      return listEntries(dp)[Number(dp.value)] ?? dp.value;
    case "NUMBER": {
      const n = Number(dp.value);
      if (!Number.isFinite(n)) return dp.value;
      const shown = n.toLocaleString(lang, { minimumFractionDigits: dp.integer ? 0 : 1, maximumFractionDigits: dp.integer ? 0 : 2 });
      return dp.unit ? `${shown} ${dp.unit}` : shown;
    }
    default:
      return dp.value;
  }
}

/** How the datapoint is operated: a pair of buttons, one button, or a field with an OK button. None if it cannot be written. */
export type Control = "toggle" | "button" | "field" | "none";
export function controlOf(dp: Datapoint): Control {
  if (!dp.writable) return "none";
  if (dp.type === "LOGIC") return "toggle";
  if (dp.type === "ACTION") return "button";
  return ["LIST", "NUMBER", "STRING"].includes(dp.type) ? "field" : "none";
}

/** The number range of a datapoint (a limit it does not have is null). */
export const numberRange = (dp: Datapoint): { min: number | null; max: number | null } => ({ min: num(dp.min), max: num(dp.max) });

/** What the field starts with. A device that never reported (or a value outside its own range) starts empty. */
export function initialInput(dp: Datapoint): string {
  if (neverReported(dp)) return "";
  if (dp.type === "NUMBER") {
    const n = Number(dp.value);
    return Number.isFinite(n) ? String(n) : "";
  }
  return dp.value;
}

/** The message key of what is wrong with the input, or null if it can be sent. */
export function validateInput(dp: Datapoint, input: string): { key: MessageKey; params?: Record<string, number> } | null {
  switch (dp.type) {
    case "NUMBER": {
      const re = dp.integer ? /^-?\d{1,15}$/ : /^-?\d{1,15}(\.\d{1,15})?$/;
      if (!re.test(input.trim())) return { key: "errNotAnumber" };
      const n = Number(input);
      const { min, max } = numberRange(dp);
      return (min !== null && n < min) || (max !== null && n > max) ? { key: "errOutOfRange" } : null;
    }
    case "STRING":
      return input.length > STRING_MAX ? { key: "errTooLong", params: { max: STRING_MAX } } : null;
    case "LIST":
      return /^\d{1,4}$/.test(input) && Number(input) < listEntries(dp).length ? null : { key: "errInvalidValue" };
    default:
      return { key: "errInvalidValue" };
  }
}

/** Has the input changed against what the CCU holds? (A device that never reported has no value to compare.) */
export function isChanged(dp: Datapoint, input: string): boolean {
  if (neverReported(dp)) return input.trim() !== "";
  return dp.type === "NUMBER" ? num(input) !== num(dp.value) : input !== dp.value;
}

/** The value of a request: a boolean for yes and no, else the text as typed (no float round trip). */
export const toRequestValue = (dp: Datapoint, input: string): string => input.trim();

/** The hint under a number field: the allowed range. */
export function rangeHint(dp: Datapoint, t: Translate): string {
  const { min, max } = numberRange(dp);
  if (min !== null && max !== null) return t("rangeHint", { min, max });
  if (min !== null) return t("minHint", { min });
  if (max !== null) return t("maxHint", { max });
  return "";
}

/** The datapoints in the order of their channels, grouped by channel (the CCU lists them channel by channel). */
export function byChannel(items: Datapoint[]): { channelId: string; channel: string; items: Datapoint[] }[] {
  const out: { channelId: string; channel: string; items: Datapoint[] }[] = [];
  for (const dp of items) {
    const last = out[out.length - 1];
    if (last && last.channelId === dp.channelId) last.items.push(dp);
    else out.push({ channelId: dp.channelId, channel: dp.channel, items: [dp] });
  }
  return out;
}
