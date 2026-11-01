import { describe, expect, it } from "vitest";
import type { AlarmMsg, ServiceMsg } from "./api";
import { countServices, formatTime, sortAlarms, sortServices, stickyCount } from "./service-messages";

const svc = (id: string, isSticky = false, occurredAt = "2026-10-31 19:00:00"): ServiceMsg => ({ id, occurredAt, channelName: "c", message: "m", isSticky, canAcknowledge: true });

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
      { id: "1", name: "old", occurredAt: "2026-10-30 08:00:00", canAcknowledge: true },
      { id: "2", name: "new", occurredAt: "2026-10-31 19:35:05", canAcknowledge: true },
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

import { ApiError, describeChangeError, makeAcknowledge } from "./api";
import { translate, type Translate } from "./i18n";

describe("confirming a message", () => {
  const t: Translate = (k, p) => translate("en", k, p);
  it("posts the id and returns whether the message is gone", async () => {
    let init: RequestInit | undefined;
    let url = "";
    const ack = makeAcknowledge(async (u, i) => ((url = String(u)), (init = i), new Response(JSON.stringify({ id: "18385", acknowledged: true }))));
    expect(await ack("sid", "18385")).toEqual({ id: "18385", acknowledged: true });
    expect(url).toContain("/messages");
    expect(JSON.parse(String(init?.body))).toEqual({ id: "18385" });
  });
  it("tells a message that is gone (404) and one that may not be confirmed (403) apart", async () => {
    const gone = await makeAcknowledge(async () => new Response(JSON.stringify({ error: { code: 501, message: "message not found" } }), { status: 404 }))("sid", "1").catch((e) => e);
    const refused = await makeAcknowledge(async () => new Response(JSON.stringify({ error: { code: 400, message: "access denied (message)" } }), { status: 403 }))("sid", "1").catch((e) => e);
    expect(gone).toBeInstanceOf(ApiError);
    expect(describeChangeError(gone, t)).toBe("This item does not exist any more.");
    expect(describeChangeError(refused, t)).toBe("You are not allowed to do this.");
  });
  it("rejects an answer that is not the expected shape", async () => {
    await expect(makeAcknowledge(async () => new Response(JSON.stringify({ id: "1" })))("sid", "1")).rejects.toBeInstanceOf(ApiError);
  });
});
