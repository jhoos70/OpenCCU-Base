import { describe, expect, it } from "vitest";
import { ApiError, describeError, isSessionExpired, login, makeGetModel, makeRpc } from "./api";

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
    expect(describeError(e)).toMatch(/v2_enabled/);
  });

  it("reports an unreachable CCU", async () => {
    const rpc = makeRpc(async () => { throw new TypeError("fetch failed"); });
    const e = await rpc("Session.login").catch((x) => x);
    expect(describeError(e)).toMatch(/cannot be reached/);
  });
});

describe("describeError", () => {
  it("maps known codes and never leaks the server message", () => {
    expect(describeError(new ApiError(501, "secret internals", 401))).toMatch(/Invalid user name or password/);
    expect(describeError(new ApiError(429, "rate limit exceeded", 429))).toMatch(/Too many attempts/);
    expect(describeError(new ApiError(999, "stack trace here", 500))).not.toMatch(/stack trace/);
    expect(describeError(new Error("x"))).toBe("Something went wrong.");
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
