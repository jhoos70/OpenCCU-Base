import { describe, expect, it } from "vitest";
import { ApiError, describeChangeError, makeClearLog, makeGetLog, type LogItem } from "./api";
import { translate, type Translate } from "./i18n";
import { activityText, filterLog, recordsIn } from "./syslog";

const t: Translate = (k, p) => translate("en", k, p);
const v = (o: Partial<LogItem["values"][number]>) => ({ value: "true", type: "LOGIC", unit: "", valueList: "", valueName0: "away", valueName1: "home", ...o });
const item = (o: Partial<LogItem>): LogItem => ({ time: "2026-10-31 21:30:35", name: "Anwesenheit", kind: "SYSVAR", datapoint: "", values: [v({})], ...o });

describe("activityText", () => {
  it("writes each value as the status of a variable is written", () => {
    expect(activityText(item({}), t, {}, "en")).toBe("home");
    expect(activityText(item({ values: [v({ value: "false" })] }), t, {}, "en")).toBe("away");
    expect(activityText(item({ values: [v({ type: "NUMBER", value: "34.500000", unit: "%" })] }), t, {}, "en")).toBe("34.50 %");
    expect(activityText(item({ values: [v({ type: "LIST", value: "1", valueList: "off;low;high" })] }), t, {}, "en")).toBe("low");
  });
  it("joins the values of one event with a comma", () => {
    expect(activityText(item({ values: [v({ type: "NUMBER", value: "0.5", unit: "%" }), v({ value: "true" })] }), t, {}, "en")).toBe("0.50 %, home");
  });
  it("resolves ${key} value names with the CCU strings", () => {
    expect(activityText(item({ values: [v({ valueName1: "${nameHome}" })] }), t, { nameHome: "zu Hause" }, "en")).toBe("zu Hause");
  });
});

describe("recordsIn and filterLog", () => {
  const items = [item({ name: "Küche", values: [v({}), v({})] }), item({ name: "Büro", time: "2026-10-30 08:00:00" })];
  it("counts records, not items", () => {
    expect(recordsIn(items)).toBe(3);
  });
  it("needs every word in the time, the name or the activity", () => {
    const f = (q: string) => filterLog(items, q, (i) => activityText(i, t, {}, "en"), (i) => i.name).map((i) => i.name);
    expect(f("")).toEqual(["Küche", "Büro"]);
    expect(f("küche home")).toEqual(["Küche"]);
    expect(f("2026-10-30")).toEqual(["Büro"]);
    expect(f("gibtesnicht")).toEqual([]);
  });
});

describe("getLog and clearLog", () => {
  const page = { total: 3, offset: 0, limit: 200, items: [item({})] };
  it("reads a page with the limit and offset and the session", async () => {
    let url = "", init: RequestInit | undefined;
    const get = makeGetLog(async (u, i) => ((url = String(u)), (init = i), new Response(JSON.stringify(page))));
    expect(await get("AbCdEf1234", 50, 100)).toEqual({ ...page, offset: 0 });
    expect(url).toBe("/api/homematic.cgi/v2/log?limit=50&offset=100");
    expect([init!.method, (init!.headers as Record<string, string>)["X-Session-Id"]]).toEqual(["GET", "AbCdEf1234"]);
  });
  it("rejects an answer that is not a log page", async () => {
    await expect(makeGetLog(async () => new Response("{}"))("s")).rejects.toBeInstanceOf(ApiError);
  });
  it("clears with DELETE and tells whether the log is empty", async () => {
    let init: RequestInit | undefined;
    const clear = makeClearLog(async (_u, i) => ((init = i), new Response('{"cleared":true,"total":0}')));
    expect(await clear("AbCdEf1234")).toEqual({ cleared: true, total: 0 });
    expect([init!.method, init!.body]).toEqual(["DELETE", undefined]);
    expect(await makeClearLog(async () => new Response('{"cleared":false,"total":3}'))("s")).toEqual({ cleared: false, total: 3 });
  });
  it("turns a refusal of the server into the words of a change", async () => {
    const fail = (status: number) => makeClearLog(async () => new Response(JSON.stringify({ error: { code: 400, message: "x" } }), { status }))("s").catch((e) => e);
    expect(describeChangeError(await fail(403), t)).toBe(t("errNotAllowed"));
  });
});
