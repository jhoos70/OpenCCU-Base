// The CCU's clock as a wall time ("2026-10-31 19:05:12" in the CCU's own time zone). It is read now and then and
// moved on with the browser's clock in between, so the displayed time keeps running without asking the CCU again.

/** The wall time as a Date whose local fields are the CCU's fields (no time zone conversion), or null. */
export function parseWallTime(ccuTime: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(ccuTime);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, s);
}

/** The CCU's wall time `now` (a browser timestamp), given the time it reported at `fetchedAt`. */
export function wallNow(ccuTime: string, fetchedAt: number, now: number): Date | null {
  const base = parseWallTime(ccuTime);
  return base ? new Date(base.getTime() + (now - fetchedAt)) : null;
}

export const formatClock = (d: Date, lang: string): string => d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
export const formatDay = (d: Date, lang: string): string => d.toLocaleDateString(lang, { day: "2-digit", month: "2-digit", year: "numeric" });
