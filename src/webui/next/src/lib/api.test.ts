import { describe, expect, it } from "vitest";
import type { Translate } from "./i18n";
import { ApiError, describeError, getHideSticky, isSessionExpired, login, makeGetMessages, makeGetModel, makeGetProfile, makeRpc } from "./api";

const reply = (status: number, body: unknown) => async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("rpc", () => {
  it("sends the v2 headers and the session", async () => {
    let seen: RequestInit | undefined;
    const rpc = makeRpc(async (_u, init) => ((seen = init), new Response('{"result":true,"error":null}')));
    await rpc("ReGa.isPresent", {}, "AbCdEf1234");
    const h = seen!.headers as Record<string, string>;
    expect(h["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["X-Session-Id"]).toBe("AbCdEf1234");
  });

  it("sends no session header without a session", async () => {
    let seen: RequestInit | undefined;
    const rpc = makeRpc(async (_u, init) => ((seen = init), new Response('{"result":"x","error":null}')));
    await rpc("Session.login", { username: "a", password: "b" });
    expect((seen!.headers as Record<string, string>)["X-Session-Id"]).toBeUndefined();
  });

  it("login returns the session id", async () => {
    const rpc = makeRpc(reply(200, { result: "AbCdEf1234", error: null }));
    expect(await login("Admin", "Admin", rpc)).toBe("AbCdEf1234");
  });

  it("turns a JSON-RPC error into an ApiError with code and status", async () => {
    const rpc = makeRpc(reply(401, { result: null, error: { code: 501, message: "invalid credentials" } }));
    const e = (await rpc("Session.login").catch((x) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect([e.code, e.status]).toEqual([501, 401]);
  });

  it("treats a non-JSON answer (lighttpd 404) as an unavailable v2 API", async () => {
    const rpc = makeRpc(reply(404, "<html>404</html>"));
    const e = await rpc("Session.login").catch((x) => x);
    expect(describeError(e, t)).toBe("errNoV2");
  });

  it("reports an unreachable CCU", async () => {
    const rpc = makeRpc(async () => { throw new TypeError("fetch failed"); });
    const e = await rpc("Session.login").catch((x) => x);
    expect(describeError(e, t)).toBe("errUnreachable");
  });
});

// the keys themselves are the expected texts here: the catalogs are tested in i18n.test.ts
const t = ((key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)) as unknown as Translate;

describe("describeError", () => {
  it("maps known codes to message keys and never leaks the server message", () => {
    expect(describeError(new ApiError(501, "secret internals", 401), t)).toBe("errCredentials");
    expect(describeError(new ApiError(429, "rate limit exceeded", 429), t)).toBe("errTooMany");
    expect(describeError(new ApiError(999, "stack trace here", 500), t)).toBe('errRefused:{"code":999}');
    expect(describeError(new Error("x"), t)).toBe("errGeneric");
  });
});

describe("getModel", () => {
  const model = { rooms: { total: 1, offset: 0, limit: 500, items: [{ id: "1", name: "Büro", description: "", channelIds: [] }] } };

  it("reads one section with the session and no request body", async () => {
    let url = "", init: RequestInit | undefined;
    const get = makeGetModel(async (u, i) => ((url = String(u)), (init = i), new Response(JSON.stringify(model))));
    const rooms = await get("rooms", "AbCdEf1234");
    expect(url).toBe("/api/homematic.cgi/v2/model?sections=rooms&limit=500");
    expect(init!.method).toBe("GET");
    expect(init!.body).toBeUndefined();
    expect((init!.headers as Record<string, string>)["X-Session-Id"]).toBe("AbCdEf1234");
    expect(rooms.items[0].name).toBe("Büro");
  });

  it("recognises an expired session", async () => {
    const get = makeGetModel(reply(401, { error: { code: 400, message: "access denied" } }));
    const e = await get("rooms", "x").catch((x) => x);
    expect(isSessionExpired(e)).toBe(true);
  });

  it("rejects an answer without the section", async () => {
    const get = makeGetModel(reply(200, {}));
    await expect(get("rooms", "x")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("getProfile", () => {
  const profile = { userId: "1004", userName: "Admin", firstName: "Max", hasPassword: true, isNoExpert: true, language: "de", level: "ADMIN" };

  it("reads the own profile with the session", async () => {
    let url = "";
    const get = makeGetProfile(async (u) => ((url = String(u)), new Response(JSON.stringify(profile))));
    const p = await get("AbCdEf1234");
    expect(url).toBe("/api/homematic.cgi/v2/profile");
    expect([p.userName, p.level, p.isNoExpert, p.language]).toEqual(["Admin", "ADMIN", true, "de"]);
  });
  it("maps an unknown or missing level to NONE (no rights are assumed)", async () => {
    for (const level of [undefined, "ROOT", 8]) {
      const get = makeGetProfile(reply(200, { ...profile, level }));
      expect((await get("x")).level).toBe("NONE");
    }
  });
  it("recognises an expired session and a broken answer", async () => {
    expect(isSessionExpired(await makeGetProfile(reply(401, { error: { code: 400, message: "x" } }))("x").catch((e) => e))).toBe(true);
    await expect(makeGetProfile(reply(200, {}))("x")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("getMessages", () => {
  const body = { alarms: { total: 1, offset: 0, limit: 500, items: [{ id: "1", name: "A", occurredAt: "2026-10-31 19:35:05" }] }, services: { total: 0, offset: 0, limit: 500, items: [] } };

  it("reads both sections in one request", async () => {
    let url = "";
    const get = makeGetMessages(async (u) => ((url = String(u)), new Response(JSON.stringify(body))));
    const m = await get("AbCdEf1234");
    expect(url).toBe("/api/homematic.cgi/v2/model?sections=alarms,services&limit=500");
    expect([m.alarms.length, m.services.length]).toEqual([1, 0]);
  });
  it("rejects an answer without both sections and recognises an expired session", async () => {
    await expect(makeGetMessages(reply(200, { alarms: body.alarms }))("x")).rejects.toBeInstanceOf(ApiError);
    expect(isSessionExpired(await makeGetMessages(reply(401, { error: { code: 400, message: "x" } }))("x").catch((e) => e))).toBe(true);
  });
});

describe("getHideSticky", () => {
  const answer = (status: number, doc: unknown) => makeRpc(reply(status, doc));
  it("is true when the CCU hides sticky messages (a number other than 0)", async () => {
    expect(await getHideSticky("x", answer(200, { result: 1, error: null }))).toBe(true);
    expect(await getHideSticky("x", answer(200, { result: 0, error: null }))).toBe(false);
  });
  it("treats a refused answer (not an admin) as hidden, like the classic UI", async () => {
    expect(await getHideSticky("x", answer(403, { error: { code: 400, message: "access denied" } }))).toBe(true);
  });
  it("passes an expired session and an unreachable CCU on", async () => {
    await expect(getHideSticky("x", answer(401, { error: { code: 400, message: "x" } }))).rejects.toMatchObject({ status: 401 });
    await expect(getHideSticky("x", makeRpc(async () => { throw new TypeError("x"); }))).rejects.toMatchObject({ code: 0 });
  });
});
