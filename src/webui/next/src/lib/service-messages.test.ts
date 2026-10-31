import { describe, expect, it } from "vitest";
import type { AlarmMsg, ServiceMsg } from "./api";
import { countServices, formatTime, sortAlarms, sortServices, stickyCount } from "./service-messages";

const svc = (id: string, isSticky = false, occurredAt = "2026-10-31 19:00:00"): ServiceMsg => ({ id, occurredAt, channelName: "c", message: "m", isSticky });

describe("countServices", () => {
  const list = [svc("1"), svc("2", true), svc("3", true)];
  it("counts every open message when sticky ones are shown", () => {
    expect(countServices(list, false)).toBe(3);
  });
  it("leaves the sticky ones out when they are hidden, and never goes below zero", () => {
    expect(countServices(list, true)).toBe(1);
    expect(countServices([svc("1", true)], true)).toBe(0);
    expect(countServices([], true)).toBe(0);
  });
  it("counts the sticky ones for the note under the list", () => {
    expect(stickyCount(list)).toBe(2);
  });
});

describe("sorting", () => {
  it("puts the newest first without changing the input", () => {
    const a: AlarmMsg[] = [
      { id: "1", name: "old", occurredAt: "2026-10-30 08:00:00" },
      { id: "2", name: "new", occurredAt: "2026-10-31 19:35:05" },
    ];
    expect(sortAlarms(a).map((x) => x.id)).toEqual(["2", "1"]);
    expect(a[0].id).toBe("1");
    expect(sortServices([svc("a", false, "2026-10-01 00:00:00"), svc("b", false, "2026-10-02 00:00:00")]).map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("formatTime", () => {
  it("writes the time the way the locale does", () => {
    expect(formatTime("2026-10-31 19:35:05", "de")).toMatch(/31\.10\.2026.*19:35:05/);
    expect(formatTime("2026-10-31 19:35:05", "en")).toMatch(/Oct 31, 2026.*7:35:05/);
  });
  it("keeps an unset time (the epoch) and anything it does not understand", () => {
    expect(formatTime("1970-01-01 01:00:00", "de")).toBe("1970-01-01 01:00:00");
    expect(formatTime("", "de")).toBe("");
    expect(formatTime("yesterday", "de")).toBe("yesterday");
  });
});
