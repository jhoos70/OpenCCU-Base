import { describe, expect, it } from "vitest";
import { ApiError, describeChangeError, makeExecuteProgram, type Program } from "./api";
import { translate, type Translate } from "./i18n";
import { filterPrograms, isListed, neverRan } from "./programs";

const p = (o: Partial<Program>): Program => ({ id: "1", name: "P", description: "", lastExecuteTime: "2026-10-31 21:00:00", isActive: true, isInternal: false, isOperable: true, isCopy: false, ...o });

describe("isListed", () => {
  it("lists what the classic status page lists: operable programs that are not copies (and not the system's own)", () => {
    expect(isListed(p({}))).toBe(true);
    expect(isListed(p({ isOperable: false }))).toBe(false);
    expect(isListed(p({ isCopy: true }))).toBe(false);
    expect(isListed(p({ isInternal: true }))).toBe(false);
  });
  it("lists an inactive program too (it can be run by hand)", () => {
    expect(isListed(p({ isActive: false }))).toBe(true);
  });
});

describe("neverRan", () => {
  it("knows the epoch and an empty time as never", () => {
    expect([neverRan(p({ lastExecuteTime: "1970-01-01 01:00:00" })), neverRan(p({ lastExecuteTime: "" })), neverRan(p({}))]).toEqual([true, true, false]);
  });
});

describe("filterPrograms", () => {
  const list = [p({ id: "1", name: "Licht 10", description: "Abends" }), p({ id: "2", name: "Licht 2", description: "Morgens an" }), p({ id: "3", name: "Heizung", isOperable: false }), p({ id: "4", name: "Rollo", description: "licht aus" })];
  it("sorts by name in the user's order (numbers numerically) and leaves out what is not listed", () => {
    expect(filterPrograms(list, "", "de").map((x) => x.name)).toEqual(["Licht 2", "Licht 10", "Rollo"]);
  });
  it("needs every word in the name or the description", () => {
    expect(filterPrograms(list, "licht abends", "de").map((x) => x.id)).toEqual(["1"]);
    expect(filterPrograms(list, "LICHT", "de").map((x) => x.id)).toEqual(["2", "1", "4"]);
    expect(filterPrograms(list, "heizung", "de")).toEqual([]);
  });
});

describe("executeProgram", () => {
  const t: Translate = (k, q) => translate("en", k, q);
  const ok = { id: "1053", executed: true, lastExecuteTime: "2026-10-31 21:08:40" };
  it("posts {id, execute: true} with the session and returns what ReGa reports", async () => {
    let url = "", init: RequestInit | undefined;
    const run = makeExecuteProgram(async (u, i) => ((url = String(u)), (init = i), new Response(JSON.stringify(ok))));
    expect(await run("AbCdEf1234", "1053")).toEqual(ok);
    expect(url).toBe("/api/homematic.cgi/v2/programs");
    expect([init!.method, init!.body]).toEqual(["POST", '{"id":"1053","execute":true}']);
    expect((init!.headers as Record<string, string>)["X-Session-Id"]).toBe("AbCdEf1234");
  });
  it("reports a program that did not run (executed false) as an answer, not an error", async () => {
    expect((await makeExecuteProgram(async () => new Response(JSON.stringify({ ...ok, executed: false })))("s", "1")).executed).toBe(false);
  });
  it("turns the server's refusals into the words of a change", async () => {
    const fail = (status: number) => makeExecuteProgram(async () => new Response(JSON.stringify({ error: { code: 400, message: "x" } }), { status }))("s", "1").catch((e) => e);
    expect(describeChangeError(await fail(403), t)).toBe(t("errNotAllowed"));
    expect(describeChangeError(await fail(404), t)).toBe(t("errGone"));
    expect(describeChangeError(new ApiError(0, "x", 0), t)).toBe(t("errUnreachable"));
  });
  it("rejects an answer without executed", async () => {
    await expect(makeExecuteProgram(async () => new Response("{}"))("s", "1")).rejects.toBeInstanceOf(ApiError);
  });
});
