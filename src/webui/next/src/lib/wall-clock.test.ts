import { describe, expect, it } from "vitest";
import { formatClock, formatDay, parseWallTime, wallNow } from "./wall-clock";

describe("parseWallTime", () => {
  it("reads the CCU's fields as they are", () => {
    const d = parseWallTime("2026-10-31 19:05:12")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([2026, 9, 31, 19, 5, 12]);
  });
  it("is null for an empty or odd text", () => {
    for (const t of ["", "yesterday", "2026-10-31", "2026-10-31T19:05:12"]) expect(parseWallTime(t)).toBeNull();
  });
});

describe("wallNow", () => {
  it("moves the reported time on with the browser's clock", () => {
    const d = wallNow("2026-10-31 19:05:12", 1_000, 1_000 + 65_000)!;
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([19, 6, 17]);
  });
  it("rolls over midnight", () => {
    const d = wallNow("2026-10-31 23:59:30", 0, 45_000)!;
    expect([d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([10, 1, 0, 0]);
  });
  it("is null when the CCU reported no time", () => {
    expect(wallNow("", 0, 5)).toBeNull();
  });
});

describe("formatting", () => {
  const d = new Date(2026, 9, 31, 7, 8, 0);
  it("writes the date and the time the way the locale does", () => {
    expect(formatDay(d, "de")).toBe("31.10.2026");
    expect(formatDay(d, "en")).toBe("10/31/2026");
    expect(formatClock(d, "de")).toBe("07:08");
  });
});
