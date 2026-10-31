import { describe, expect, it } from "vitest";
import { ApiError, describeChangeError, makeSetSysVar, type SysVar } from "./api";
import { translate, type Translate } from "./i18n";
import { choices, initialInput, isChanged, isEditable, numberRange, toRequestValue, validateInput } from "./sysvar-edit";

const t: Translate = (k, p) => translate("en", k, p);
const sv = (o: Partial<SysVar>): SysVar => ({ id: "1", name: "x", type: "STRING", unit: "", value: "", description: "", lastModified: "", isVisible: true, isInternal: false, ...o });

describe("isEditable", () => {
  it("allows logic, list, number and string variables", () => {
    for (const type of ["LOGIC", "LIST", "NUMBER", "STRING"]) expect([type, isEditable(sv({ type }))]).toEqual([type, true]);
  });
  it("refuses alarms, the system's own and hidden variables", () => {
    expect(isEditable(sv({ type: "ALARM" }))).toBe(false);
    expect(isEditable(sv({ type: "NUMBER", isInternal: true }))).toBe(false);
    expect(isEditable(sv({ type: "NUMBER", isVisible: false }))).toBe(false);
    expect(isEditable(sv({ type: "UNKNOWN" }))).toBe(false);
  });
});

describe("choices", () => {
  it("offers the two value names of a logic variable, false first, with the classic strings and a fallback", () => {
    const v = sv({ type: "LOGIC", valueName0: "away", valueName1: "${nameHome}" });
    expect(choices(v, t, { nameHome: "home" }).map((c) => [c.value, c.label])).toEqual([["false", "away"], ["true", "home"]]);
    expect(choices(sv({ type: "LOGIC" }), t, {}).map((c) => c.label)).toEqual(["no", "yes"]);
    expect(choices(sv({ type: "LOGIC", valueName1: "${unknown}" }), t, {}).map((c) => c.label)).toEqual(["no", "yes"]);
  });
  it("offers the entries of a list variable by index", () => {
    expect(choices(sv({ type: "LIST", valueList: "off;low;high" }), t, {}).map((c) => [c.value, c.label])).toEqual([["0", "off"], ["1", "low"], ["2", "high"]]);
  });
});

describe("validateInput", () => {
  const n = sv({ type: "NUMBER", minValue: "0", maxValue: "10" });
  it("takes a decimal within the limits, the limits included", () => {
    for (const s of ["0", "10", "7.5", "-0"]) expect([s, validateInput(n, s)]).toEqual([s, null]);
  });
  it("refuses text, an exponent, an empty field and values outside the limits", () => {
    for (const s of ["", "abc", "1e3", "7,5", "1 2"]) expect([s, validateInput(n, s)?.key]).toEqual([s, "errNotAnumber"]);
    for (const s of ["10.1", "-1", "11"]) expect([s, validateInput(n, s)?.key]).toEqual([s, "errOutOfRange"]);
  });
  it("has no limit where the variable has none", () => {
    expect(validateInput(sv({ type: "NUMBER" }), "-123456.789")).toBeNull();
    expect(numberRange(sv({ type: "NUMBER", minValue: "", maxValue: "5" }))).toEqual({ min: null, max: 5 });
  });
  it("limits a string to 1000 characters", () => {
    expect(validateInput(sv({}), "x".repeat(1000))).toBeNull();
    expect(validateInput(sv({}), "x".repeat(1001))?.key).toBe("errTooLong");
  });
  it("takes only a true or false for a logic variable and an existing index for a list", () => {
    expect(validateInput(sv({ type: "LOGIC" }), "true")).toBeNull();
    expect(validateInput(sv({ type: "LOGIC" }), "yes")?.key).toBe("errInvalidValue");
    const l = sv({ type: "LIST", valueList: "a;b;c" });
    expect([validateInput(l, "2"), validateInput(l, "3")?.key, validateInput(l, "-1")?.key]).toEqual([null, "errInvalidValue", "errInvalidValue"]);
  });
});

describe("what the form starts with and what is sent", () => {
  it("starts with the current value (a number as a plain number)", () => {
    expect(initialInput(sv({ type: "NUMBER", value: "7.500000" }))).toBe("7.5");
    expect(initialInput(sv({ type: "LIST", value: "2" }))).toBe("2");
    expect(initialInput(sv({ type: "LOGIC", value: "true" }))).toBe("true");
  });
  it("knows whether anything changed (7.5 and 7.500000 are the same number)", () => {
    expect(isChanged(sv({ type: "NUMBER", value: "7.500000" }), "7.5")).toBe(false);
    expect(isChanged(sv({ type: "NUMBER", value: "7.500000" }), "7.6")).toBe(true);
    expect(isChanged(sv({ type: "LIST", value: "1" }), "2")).toBe(true);
    expect(isChanged(sv({ type: "STRING", value: "a" }), "a")).toBe(false);
  });
  it("sends a boolean for a logic variable and the text as typed otherwise", () => {
    expect(toRequestValue(sv({ type: "LOGIC" }), "false")).toBe(false);
    expect(toRequestValue(sv({ type: "NUMBER" }), " 0.1 ")).toBe("0.1");
    expect(toRequestValue(sv({ type: "LIST" }), "2")).toBe("2");
  });
});

describe("setSysVar", () => {
  const ok = { id: "950", value: "false", lastModified: "2026-10-31 21:00:00" };
  it("posts {id, value} with the session and returns what ReGa reports", async () => {
    let url = "", init: RequestInit | undefined;
    const set = makeSetSysVar(async (u, i) => ((url = String(u)), (init = i), new Response(JSON.stringify(ok))));
    expect(await set("AbCdEf1234", "950", false)).toEqual(ok);
    expect(url).toBe("/api/homematic.cgi/v2/sysvars");
    expect([init!.method, init!.body]).toEqual(["POST", '{"id":"950","value":false}']);
    const h = init!.headers as Record<string, string>;
    expect([h["X-Session-Id"], h["X-Requested-With"], h["Content-Type"]]).toEqual(["AbCdEf1234", "XMLHttpRequest", "application/json"]);
  });
  it("turns the server's refusals into errors with the HTTP status", async () => {
    const fail = (status: number) => makeSetSysVar(async () => new Response(JSON.stringify({ error: { code: 403, message: "x" } }), { status }))("s", "1", "v").catch((e) => e);
    expect((await fail(422)).status).toBe(422);
    expect(describeChangeError(await fail(422), t)).toBe(t("errInvalidValue"));
    expect(describeChangeError(await fail(403), t)).toBe(t("errNotAllowed"));
    expect(describeChangeError(await fail(404), t)).toBe(t("errGone"));
    expect(describeChangeError(new ApiError(0, "x", 0), t)).toBe(t("errUnreachable"));
  });
  it("rejects an answer without a value", async () => {
    await expect(makeSetSysVar(async () => new Response("{}"))("s", "1", "v")).rejects.toBeInstanceOf(ApiError);
  });
});
