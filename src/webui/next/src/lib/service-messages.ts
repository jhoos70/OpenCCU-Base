import type { AlarmMsg, ServiceMsg } from "./api";

/** The number the classic header shows: all open service messages, minus the sticky-unreach ones when they are hidden. */
export function countServices(services: readonly ServiceMsg[], hideSticky: boolean): number {
  return hideSticky ? services.filter((s) => !s.isSticky).length : services.length;
}

export const stickyCount = (services: readonly ServiceMsg[]): number => services.filter((s) => s.isSticky).length;

// "2026-10-31 19:35:05" (CCU local time) sorts as text; the newest comes first.
const newestFirst = (a: { occurredAt: string }, b: { occurredAt: string }): number => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0);
export const sortAlarms = (alarms: readonly AlarmMsg[]): AlarmMsg[] => [...alarms].sort(newestFirst);
export const sortServices = (services: readonly ServiceMsg[]): ServiceMsg[] => [...services].sort(newestFirst);

/** "2026-10-31 19:35:05" as the user's locale writes it; a time the CCU has not set (the epoch) or garbage stays as it is. */
export function formatTime(ccuTime: string, lang: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(ccuTime);
  if (!m || m[1] === "1970") return ccuTime;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, s).toLocaleString(lang, { dateStyle: "medium", timeStyle: "medium" });
}
