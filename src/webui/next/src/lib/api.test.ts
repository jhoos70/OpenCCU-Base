import { describe, expect, it } from "vitest";
import type { Translate } from "./i18n";
import { isValidFavouriteName } from "@/components/FavouriteListDialog";
import { ApiError, describeError, getHideSticky, isSessionExpired, login, makeDeleteFavourite, makeGetMessages, makeGetModel, makeGetProfile, makeGetSystem, makeRpc, makeSaveFavourite } from "./api";

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
    expect([p.userName, p.level, p.isNoExpert, p.language, p.hasPassword]).toEqual(["Admin", "ADMIN", true, "de", true]);
  });
  it("takes only an explicit false as no password (a missing field raises no alarm)", async () => {
    expect((await makeGetProfile(reply(200, { ...profile, hasPassword: false }))("x")).hasPassword).toBe(false);
    expect((await makeGetProfile(reply(200, { ...profile, hasPassword: undefined }))("x")).hasPassword).toBe(true);
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

describe("getSystem", () => {
  const body = { time: "2026-10-31 19:05:12", sunrise: "07:08", sunset: "16:32", firmwareVersion: "3.89.11.20261019" };
  it("reads the system information with the session", async () => {
    let url = "";
    const get = makeGetSystem(async (u) => ((url = String(u)), new Response(JSON.stringify(body))));
    expect(await get("AbCdEf1234")).toEqual(body);
    expect(url).toBe("/api/homematic.cgi/v2/system");
  });
  it("fills what is missing with empty texts and rejects an answer without a time", async () => {
    expect(await makeGetSystem(reply(200, { time: "" }))("x")).toEqual({ time: "", sunrise: "", sunset: "", firmwareVersion: "" });
    await expect(makeGetSystem(reply(200, {}))("x")).rejects.toBeInstanceOf(ApiError);
    expect(isSessionExpired(await makeGetSystem(reply(401, { error: { code: 400, message: "x" } }))("x").catch((e) => e))).toBe(true);
  });
});

describe("saveFavourite and deleteFavourite", () => {
  it("POSTs a favourite list without id for creation and strips separator ids", async () => {
    let url = "", init: RequestInit | undefined;
    const saved = { id: "2001", name: "Heizung", info: "OG", items: [{ id: "4477", type: "CHANNEL", name: "AZ:1" }, { id: "2002", type: "SEPARATOR", name: "" }] };
    const save = makeSaveFavourite(async (u, i) => ((url = String(u)), (init = i), new Response(JSON.stringify(saved))));
    const out = await save("AbCdEf1234", { name: "Heizung", info: "OG", items: [{ type: "CHANNEL", id: "4477" }, { type: "SEPARATOR", id: "999" }] });
    expect(url).toBe("/api/homematic.cgi/v2/favourites");
    expect(init!.method).toBe("POST");
    expect(JSON.parse(String(init!.body))).toEqual({ name: "Heizung", info: "OG", items: [{ type: "CHANNEL", id: "4477" }, { type: "SEPARATOR" }] });
    expect(out).toEqual(saved);
  });

  it("DELETEs a favourite list by id", async () => {
    let url = "", init: RequestInit | undefined;
    const del = makeDeleteFavourite(async (u, i) => ((url = String(u)), (init = i), new Response('{"id":"1587","deleted":true}')));
    expect(await del("AbCdEf1234", "1587")).toEqual({ id: "1587", deleted: true });
    expect([url, init!.method]).toEqual(["/api/homematic.cgi/v2/favourites?id=1587", "DELETE"]);
  });

  it("validates favourite list names", () => {
    expect(isValidFavouriteName("Heizung")).toBe(true);
    expect(isValidFavouriteName("   ")).toBe(false);
    expect(isValidFavouriteName("_USER1004")).toBe(false);
    expect(isValidFavouriteName("a\nb")).toBe(false);
  });
});

describe("saveDeviceConfig", () => {
  it("calls appropriate RPC methods for device name, channel properties, and room/function memberships", async () => {
    const calls: { method: string; params: unknown; sid: string | undefined }[] = [];
    const mockRpc = async <T>(method: string, params?: Record<string, unknown>, sid?: string): Promise<T> => {
      calls.push({ method, params, sid });
      return true as T;
    };

    const { saveDeviceConfig } = await import("./api");
    await saveDeviceConfig(
      "sid123",
      {
        deviceId: "dev1",
        name: "New Dev Name",
        channels: [
          {
            channelId: "ch1",
            name: "New Ch Name",
            isLogged: true,
            mode: "MODE_AES",
            addRoomIds: ["r1", "r2"],
            removeRoomIds: ["r3"],
            addFuncIds: ["f1"],
            removeFuncIds: ["f2"],
          },
        ],
      },
      mockRpc,
    );

    expect(calls).toEqual([
      { method: "Device.setName", params: { id: "dev1", name: "New Dev Name" }, sid: "sid123" },
      { method: "Channel.setName", params: { id: "ch1", name: "New Ch Name" }, sid: "sid123" },
      { method: "Channel.setLogging", params: { id: "ch1", isLogged: "true" }, sid: "sid123" },
      { method: "Channel.setMode", params: { id: "ch1", mode: "MODE_AES" }, sid: "sid123" },
      { method: "Room.addChannel", params: { id: "r1", channelId: "ch1" }, sid: "sid123" },
      { method: "Room.addChannel", params: { id: "r2", channelId: "ch1" }, sid: "sid123" },
      { method: "Room.removeChannel", params: { id: "r3", channelId: "ch1" }, sid: "sid123" },
      { method: "Subsection.addChannel", params: { id: "f1", channelId: "ch1" }, sid: "sid123" },
      { method: "Subsection.removeChannel", params: { id: "f2", channelId: "ch1" }, sid: "sid123" },
    ]);
  });
});

describe("Paramsets API", () => {
  it("xmlRpcTypeFor maps param types properly", async () => {
    const { xmlRpcTypeFor } = await import("./api");
    expect(xmlRpcTypeFor("BOOL")).toBe("bool");
    expect(xmlRpcTypeFor("INTEGER")).toBe("int");
    expect(xmlRpcTypeFor("ENUM")).toBe("int");
    expect(xmlRpcTypeFor("FLOAT")).toBe("double");
    expect(xmlRpcTypeFor("STRING")).toBe("string");
    expect(xmlRpcTypeFor("ACTION")).toBe("string");
  });

  it("getParamsetDescription and getParamset invoke RPC with correct interface and address", async () => {
    const calls: { method: string; params: unknown }[] = [];
    const mockRpc = async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
      calls.push({ method, params });
      if (method === "Interface.getParamsetDescription") {
        return [{ NAME: "PARAM1", TYPE: "BOOL" }] as T;
      }
      return { PARAM1: true } as T;
    };

    const { getParamsetDescription, getParamset, putParamset } = await import("./api");
    const desc = await getParamsetDescription("sid1", "BidCos-RF", "PEQ001:1", "MASTER", mockRpc);
    expect(desc).toEqual([{ NAME: "PARAM1", TYPE: "BOOL" }]);

    const values = await getParamset("sid1", "BidCos-RF", "PEQ001:1", "MASTER", mockRpc);
    expect(values).toEqual({ PARAM1: true });

    await putParamset("sid1", "BidCos-RF", "PEQ001:1", [{ name: "PARAM1", type: "bool", value: "false" }], "MASTER", mockRpc);

    expect(calls).toEqual([
      { method: "Interface.getParamsetDescription", params: { interface: "BidCos-RF", address: "PEQ001:1", paramsetKey: "MASTER" } },
      { method: "Interface.getParamset", params: { interface: "BidCos-RF", address: "PEQ001:1", paramsetKey: "MASTER" } },
      { method: "Interface.putParamset", params: { interface: "BidCos-RF", address: "PEQ001:1", paramsetKey: "MASTER", set: [{ name: "PARAM1", type: "bool", value: "false" }] } },
    ]);
  });

  it("getDeviceLinks, addDeviceLink, removeDeviceLink, setDeviceLinkInfo call correct methods", async () => {
    const calls: { method: string; params: unknown }[] = [];
    const mockRpc = async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
      calls.push({ method, params });
      if (method === "Interface.getLinks") {
        return [{ name: "Link 1", sender: "S1", receiver: "R1", flags: 0 }] as T;
      }
      return true as T;
    };

    const { getDeviceLinks, addDeviceLink, removeDeviceLink, setDeviceLinkInfo } = await import("./api");
    const links = await getDeviceLinks("sid1", "BidCos-RF", "S1", mockRpc);
    expect(links).toEqual([{ name: "Link 1", sender: "S1", receiver: "R1", flags: 0 }]);

    await addDeviceLink("sid1", "BidCos-RF", "S1", "R1", "New Link", "Desc", mockRpc);
    await removeDeviceLink("sid1", "BidCos-RF", "S1", "R1", mockRpc);
    await setDeviceLinkInfo("sid1", "BidCos-RF", "S1", "R1", "Renamed Link", "New Desc", mockRpc);

    expect(calls).toEqual([
      { method: "Interface.getLinks", params: { interface: "BidCos-RF", address: "S1", flags: 6 } },
      { method: "Interface.addLink", params: { interface: "BidCos-RF", sender: "S1", receiver: "R1", name: "New Link", description: "Desc" } },
      { method: "Interface.removeLink", params: { interface: "BidCos-RF", sender: "S1", receiver: "R1" } },
      { method: "Interface.setLinkInfo", params: { interface: "BidCos-RF", sender: "S1", receiver: "R1", name: "Renamed Link", description: "New Desc" } },
    ]);
  });
});
