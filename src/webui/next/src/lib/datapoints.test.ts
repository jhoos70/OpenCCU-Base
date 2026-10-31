import { describe, expect, it } from "vitest";
import type { Datapoint } from "./api";
import type { Translate } from "./i18n";
import { byChannel, controlOf, formatDatapoint, initialInput, isChanged, listEntries, neverReported, validateInput } from "./datapoints";
import { makeSetValue, makeGetValues, describeChangeError, ApiError } from "./api";
import { en } from "./messages";
import { translate } from "./i18n";

const dp = (o: Partial<Datapoint>): Datapoint => ({
  id: "1", name: "BidCos-RF.X:1.P", channelId: "10", channel: "X:1", param: "P", type: "NUMBER", value: "21.000000", unit: "°C", min: "4.5", max: "30.5",
  valueList: "", timestamp: "2026-11-01 10:00:00", integer: false, readable: true, writable: true, ...o,
});
const t: Translate = (k, p) => translate("en", k, p);

describe("what is shown", () => {
  it("shows nothing for a device that never reported, and for a button", () => {
    expect(neverReported(dp({ timestamp: "1970-01-01 01:00:00" }))).toBe(true);
    expect(formatDatapoint(dp({ timestamp: "1970-01-01 01:00:00" }), t, "en")).toBe("");
    expect(formatDatapoint(dp({ type: "ACTION", value: "" }), t, "en")).toBe("");
  });
  it("writes a number with its unit and decimals, a list entry, yes and no", () => {
    expect(formatDatapoint(dp({}), t, "en")).toBe("21.0 °C");
    expect(formatDatapoint(dp({ value: "21.456" }), t, "en")).toBe("21.46 °C");
    expect(formatDatapoint(dp({ value: "21.5" }), t, "de")).toBe("21,5 °C");
    expect(formatDatapoint(dp({ integer: true, value: "7", unit: "%" }), t, "en")).toBe("7 %");
    expect(formatDatapoint(dp({ type: "LIST", value: "1", valueList: "AUTO;MANU", unit: "" }), t, "en")).toBe("MANU");
    expect(formatDatapoint(dp({ type: "LOGIC", value: "true" }), t, "en")).toBe("yes");
    expect(formatDatapoint(dp({ type: "LOGIC", value: "false" }), t, "en")).toBe("no");
  });
  it("splits the list", () => expect(listEntries(dp({ valueList: "a;b;;d" }))).toEqual(["a", "b", "", "d"]));
});

describe("the control", () => {
  it("follows the type and the write flag", () => {
    expect(controlOf(dp({ type: "LOGIC" }))).toBe("toggle");
    expect(controlOf(dp({ type: "ACTION" }))).toBe("button");
    expect(controlOf(dp({ type: "NUMBER" }))).toBe("field");
    expect(controlOf(dp({ type: "LIST" }))).toBe("field");
    expect(controlOf(dp({ type: "STRING" }))).toBe("field");
    expect(controlOf(dp({ type: "NUMBER", writable: false }))).toBe("none");
    expect(controlOf(dp({ type: "UNKNOWN" }))).toBe("none");
  });
});

describe("the input", () => {
  it("starts empty for a device that never reported, else with the value", () => {
    expect(initialInput(dp({ timestamp: "1970-01-01 01:00:00" }))).toBe("");
    expect(initialInput(dp({ value: "21.500000" }))).toBe("21.5");
    expect(initialInput(dp({ type: "LIST", value: "2" }))).toBe("2");
  });
  it("checks numbers against type and range", () => {
    expect(validateInput(dp({}), "20")).toBeNull();
    expect(validateInput(dp({}), "4.5")).toBeNull();
    expect(validateInput(dp({}), "30.5")).toBeNull();
    expect(validateInput(dp({}), "31")?.key).toBe("errOutOfRange");
    expect(validateInput(dp({}), "4")?.key).toBe("errOutOfRange");
    expect(validateInput(dp({}), "abc")?.key).toBe("errNotAnumber");
    expect(validateInput(dp({}), "1e1")?.key).toBe("errNotAnumber");
    expect(validateInput(dp({ integer: true, min: "0", max: "99" }), "1.5")?.key).toBe("errNotAnumber");
    expect(validateInput(dp({ integer: true, min: "0", max: "99" }), "50")).toBeNull();
  });
  it("checks list and string", () => {
    const list = dp({ type: "LIST", valueList: "a;b;c" });
    expect(validateInput(list, "2")).toBeNull();
    expect(validateInput(list, "3")?.key).toBe("errInvalidValue");
    expect(validateInput(list, "x")?.key).toBe("errInvalidValue");
    expect(validateInput(dp({ type: "STRING" }), "x".repeat(1001))?.key).toBe("errTooLong");
  });
  it("sees a change only when something differs", () => {
    expect(isChanged(dp({ value: "21.000000" }), "21")).toBe(false);
    expect(isChanged(dp({ value: "21.000000" }), "21.5")).toBe(true);
    expect(isChanged(dp({ timestamp: "1970-01-01 01:00:00" }), "")).toBe(false);
    expect(isChanged(dp({ timestamp: "1970-01-01 01:00:00" }), "20")).toBe(true);
  });
});

describe("grouping", () => {
  it("groups by channel in order", () => {
    const g = byChannel([dp({ id: "1", channelId: "a" }), dp({ id: "2", channelId: "a" }), dp({ id: "3", channelId: "b" })]);
    expect(g.map((c) => [c.channelId, c.items.length])).toEqual([["a", 2], ["b", 1]]);
  });
});

describe("the requests", () => {
  const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
  it("reads the datapoints of a device", async () => {
    let url = "";
    const get = makeGetValues(async (u) => ((url = String(u)), new Response(JSON.stringify({ device: "5", items: [dp({})] }))));
    expect((await get("sid", "5")).length).toBe(1);
    expect(url).toContain("/values?device=5");
  });
  it("sends one value and returns the datapoint", async () => {
    let init: RequestInit | undefined;
    const set = makeSetValue(async (_u, i) => ((init = i), new Response(JSON.stringify(dp({ value: "20.0" })))));
    expect((await set("sid", "1", "20")).value).toBe("20.0");
    expect(JSON.parse(String(init?.body))).toEqual({ id: "1", value: "20" });
  });
  it("tells a refused command apart (HTTP 502)", async () => {
    const set = makeSetValue(reply(502, { error: { code: 501, message: "the device interface did not take the command" } }));
    const err = await set("sid", "1", true).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(describeChangeError(err, t)).toBe(en.errNotSent);
  });
});
