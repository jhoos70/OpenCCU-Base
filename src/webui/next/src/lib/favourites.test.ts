import { describe, expect, it } from "vitest";
import type { Datapoint } from "./api";
import { channelIds, splitDatapoints } from "./favourites";
import { makeGetChannelValues, makeGetFavourites, CHANNELS_PER_REQUEST } from "./api";

const dp = (param: string, o: Partial<Datapoint> = {}): Datapoint => ({
  id: param, name: "x." + param, channelId: "1", channel: "c:1", param, type: "NUMBER", value: "1", unit: "", min: "", max: "", valueList: "",
  timestamp: "2026-11-01 10:00:00", integer: false, readable: true, writable: false, ...o,
});

describe("what a channel shows at first sight", () => {
  it("puts the usual parameters first, in the usual order, and the rest under more", () => {
    const r = splitDatapoints([dp("RSSI"), dp("ACTUAL_TEMPERATURE"), dp("SET_TEMPERATURE"), dp("STATE"), dp("LOWBAT")]);
    expect(r.shown.map((d) => d.param)).toEqual(["STATE", "SET_TEMPERATURE", "ACTUAL_TEMPERATURE"]);
    expect(r.more.map((d) => d.param)).toEqual(["RSSI", "LOWBAT"]);
  });
  it("falls back to what can be operated, then to the first three, so a channel is never empty", () => {
    const w = splitDatapoints([dp("A"), dp("B", { writable: true }), dp("C")]);
    expect(w.shown.map((d) => d.param)).toEqual(["B"]);
    expect(w.more.map((d) => d.param)).toEqual(["A", "C"]);
    const r = splitDatapoints([dp("A"), dp("B"), dp("C"), dp("D")]);
    expect(r.shown.map((d) => d.param)).toEqual(["A", "B", "C"]);
    expect(r.more.map((d) => d.param)).toEqual(["D"]);
    expect(splitDatapoints([])).toEqual({ shown: [], more: [] });
  });
});

describe("channel ids", () => {
  it("lists the channels of a list in order without repeats and leaves out the rest", () => {
    expect(channelIds([{ id: "5", type: "CHANNEL" }, { id: "9", type: "SYSVAR" }, { id: "5", type: "CHANNEL" }, { id: "7", type: "CHANNEL" }, { id: "1", type: "SEPARATOR" }])).toEqual(["5", "7"]);
  });
});

describe("the requests", () => {
  it("reads the lists", async () => {
    const get = makeGetFavourites(async () => new Response(JSON.stringify({ lists: [{ id: "1", name: "A", info: "", items: [] }] })));
    expect((await get("sid")).map((l) => l.name)).toEqual(["A"]);
  });
  it("reads the channels in chunks of the server's limit and joins the answers", async () => {
    const urls: string[] = [];
    const get = makeGetChannelValues(async (u) => {
      urls.push(String(u));
      return new Response(JSON.stringify({ items: [dp("P" + urls.length)] }));
    });
    const ids = Array.from({ length: CHANNELS_PER_REQUEST + 5 }, (_, i) => String(i + 1));
    const all = await get("sid", ids);
    expect(urls.length).toBe(2);
    expect(urls[0]).toContain("/values?channels=1,2,3");
    expect(urls[1].split("channels=")[1].split(",").length).toBe(5);
    expect(all.map((d) => d.param)).toEqual(["P1", "P2"]);
  });
  it("makes no request for no channels", async () => {
    let n = 0;
    const get = makeGetChannelValues(async () => (n++, new Response("{}")));
    expect(await get("sid", [])).toEqual([]);
    expect(n).toBe(0);
  });
});
