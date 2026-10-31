// Client of the v2 JSON-RPC API (src/webui/www/api/v2). v2 uses real HTTP status codes, the header
// X-Requested-With, and X-Session-Id for the session returned by Session.login.
import type { Translate } from "./i18n";

// Route B (.migration/plan/decisions-ui.md D5): the router answers below homematic.cgi until lighttpd
// routes /api/v2 itself. Override with VITE_API_BASE=/api/v2 once it does.
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "/api/homematic.cgi/v2";

export class ApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Rpc = <T>(method: string, params?: Record<string, unknown>, sid?: string) => Promise<T>;

type Fetch = typeof fetch;
const defaultFetch: Fetch = (...a) => fetch(...a);

/** Sends one request and returns the parsed JSON document; transport problems become ApiErrors. */
async function send(doFetch: Fetch, path: string, init: RequestInit): Promise<{ doc: unknown; status: number }> {
  let res: Response;
  try {
    res = await doFetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, "network error", 0);
  }
  try {
    return { doc: await res.json(), status: res.status };
  } catch {
    // not JSON: lighttpd's 404 page, i.e. the v2 router is not answering
    throw new ApiError(0, `unexpected response (HTTP ${res.status})`, res.status);
  }
}

function headersFor(sid?: string, json = false): Record<string, string> {
  const headers: Record<string, string> = { "X-Requested-With": "XMLHttpRequest" };
  if (json) headers["Content-Type"] = "application/json";
  if (sid) headers["X-Session-Id"] = sid;
  return headers;
}

type ErrorDoc = { error?: { code?: number; message?: string } | null };
function throwIfError(doc: unknown, status: number): void {
  const err = (doc as ErrorDoc | null)?.error;
  if (err) throw new ApiError(err.code ?? 0, err.message ?? "error", status);
}

export function makeRpc(doFetch: Fetch = defaultFetch): Rpc {
  return async function rpc<T>(method: string, params: Record<string, unknown> = {}, sid?: string): Promise<T> {
    const body = JSON.stringify({ version: "1.1", method, params, id: 1 });
    const { doc, status } = await send(doFetch, "/rpc", { method: "POST", headers: headersFor(sid, true), body });
    throwIfError(doc, status);
    return (doc as { result?: T } | null)?.result as T;
  };
}

// ---- the bulk read model: GET /model (devices, channels, rooms, functions, sysvars, programs)

export interface Section<T> {
  total: number;
  offset: number;
  limit: number;
  items: T[];
}

export interface Room {
  id: string;
  name: string;
  description: string;
  channelIds: string[];
}

export interface SysVar {
  id: string;
  name: string;
  type: string; // LOGIC, NUMBER, ENUM, ALARM, STRING
  unit: string;
  value: string;
  valueName0?: string;
  valueName1?: string;
  valueList?: string;
  isVisible: boolean;
  isInternal: boolean;
}

export interface Channel {
  id: string;
  name: string;
  address: string;
  deviceId: string;
  index: number;
  channelType: string;
  category: string;
}

export interface Device {
  id: string;
  name: string;
  address: string;
  interface: string;
  type: string; // the device type, e.g. HmIP-eTRV-B; its description is a CCU string
  isReady: boolean;
  channels: Channel[];
}

export type Level = "ADMIN" | "USER" | "GUEST" | "NONE";

export interface Profile {
  userId: string;
  userName: string;
  firstName: string;
  hasPassword: boolean;
  isNoExpert: boolean;
  language: string;
  level: Level;
}

export interface AlarmMsg {
  id: string;
  name: string;
  occurredAt: string; // "2026-10-31 19:35:05", CCU local time
}

export interface ServiceMsg {
  id: string;
  occurredAt: string;
  channelName: string;
  message: string; // string table text, may contain ${key} references (see ccu-strings.ts)
  isSticky: boolean; // a sticky-unreach message: the classic header may leave it out of the count
}

export interface Model {
  alarms: Section<AlarmMsg>;
  services: Section<ServiceMsg>;
  devices: Section<Device>;
  rooms: Section<Room>;
  sysvars: Section<SysVar>;
}

export type ModelSection = keyof Model;
export type GetModel = <S extends ModelSection>(section: S, sid: string, limit?: number) => Promise<Model[S]>;

export function makeGetModel(doFetch: Fetch = defaultFetch): GetModel {
  return async function getModel<S extends ModelSection>(section: S, sid: string, limit = 500): Promise<Model[S]> {
    const { doc, status } = await send(doFetch, `/model?sections=${section}&limit=${limit}`, { method: "GET", headers: headersFor(sid) });
    throwIfError(doc, status);
    const data = (doc as Partial<Model> | null)?.[section];
    if (!data || !Array.isArray(data.items)) throw new ApiError(0, "unexpected model", status);
    return data as Model[S];
  };
}

export interface MessageSnapshot {
  alarms: AlarmMsg[];
  services: ServiceMsg[];
}

/** The alarm and service messages (the classic header's two counters) in one request. */
export function makeGetMessages(doFetch: Fetch = defaultFetch): (sid: string) => Promise<MessageSnapshot> {
  return async function getMessages(sid: string): Promise<MessageSnapshot> {
    const { doc, status } = await send(doFetch, "/model?sections=alarms,services&limit=500", { method: "GET", headers: headersFor(sid) });
    throwIfError(doc, status);
    const m = doc as Partial<Model> | null;
    if (!m || !Array.isArray(m.alarms?.items) || !Array.isArray(m.services?.items)) throw new ApiError(0, "unexpected messages", status);
    return { alarms: m.alarms.items, services: m.services.items };
  };
}

/**
 * Does the CCU hide sticky-unreach messages from the count (CCU.getStickyUnreachState, admin only)? The classic
 * UI asks every user and treats a refused answer as "hide"; this does the same.
 */
export async function getHideSticky(sid: string, call: Rpc = rpc): Promise<boolean> {
  try {
    return Number(await call<unknown>("CCU.getStickyUnreachState", {}, sid)) !== 0;
  } catch (e) {
    if (e instanceof ApiError && e.status !== 0) {
      if (isSessionExpired(e)) throw e;
      return true;
    }
    throw e;
  }
}

/** The raw answer of Interface.getDutyCycle (an OpenCCU method; code 401 "unknown method" where it does not exist). */
export const getDutyCycle = (sid: string, call: Rpc = rpc): Promise<unknown> => call<unknown>("Interface.getDutyCycle", {}, sid);
export const isUnknownMethod = (e: unknown): boolean => e instanceof ApiError && e.code === 401;

export interface SystemInfo {
  /** The CCU's clock "2026-10-31 19:05:12" (its own time zone); "" if it cannot be read. */
  time: string;
  sunrise: string; // "07:08"
  sunset: string;
  firmwareVersion: string;
}

export function makeGetSystem(doFetch: Fetch = defaultFetch): (sid: string) => Promise<SystemInfo> {
  return async function getSystem(sid: string): Promise<SystemInfo> {
    const { doc, status } = await send(doFetch, "/system", { method: "GET", headers: headersFor(sid) });
    throwIfError(doc, status);
    const d = doc as Partial<SystemInfo> | null;
    if (!d || typeof d.time !== "string") throw new ApiError(0, "unexpected system information", status);
    return { time: d.time, sunrise: String(d.sunrise ?? ""), sunset: String(d.sunset ?? ""), firmwareVersion: String(d.firmwareVersion ?? "") };
  };
}
const getSystemDefault = makeGetSystem();
export const getSystem = (sid: string): Promise<SystemInfo> => getSystemDefault(sid);

export type GetProfile = (sid: string) => Promise<Profile>;

export function makeGetProfile(doFetch: Fetch = defaultFetch): GetProfile {
  return async function getProfile(sid: string): Promise<Profile> {
    const { doc, status } = await send(doFetch, "/profile", { method: "GET", headers: headersFor(sid) });
    throwIfError(doc, status);
    const p = doc as Partial<Profile> | null;
    if (!p || typeof p.userName !== "string") throw new ApiError(0, "unexpected profile", status);
    const level: Level = p.level === "ADMIN" || p.level === "USER" || p.level === "GUEST" ? p.level : "NONE";
    return { userId: String(p.userId ?? ""), userName: p.userName, firstName: String(p.firstName ?? ""), hasPassword: p.hasPassword !== false, isNoExpert: p.isNoExpert === true, language: String(p.language ?? ""), level };
  };
}

const getMessagesDefault = makeGetMessages();
export const getMessages = (sid: string): Promise<MessageSnapshot> => getMessagesDefault(sid);

const getProfileDefault = makeGetProfile();
export const getProfile: GetProfile = (sid) => getProfileDefault(sid);

const getModelDefault = makeGetModel();
export const getModel: GetModel = (section, sid, limit) => getModelDefault(section, sid, limit);

const rpc = makeRpc();

export const login = (username: string, password: string, call: Rpc = rpc) => call<string>("Session.login", { username, password });
export const logout = (sid: string, call: Rpc = rpc) => call<boolean>("Session.logout", {}, sid);
export const renew = (sid: string, call: Rpc = rpc) => call<unknown>("Session.renew", {}, sid);

export const isSessionExpired = (e: unknown): boolean => e instanceof ApiError && e.status === 401;

/** A message for the user; never shows internals. */
export function describeError(e: unknown, t: Translate): string {
  if (!(e instanceof ApiError)) return t("errGeneric");
  if (e.status === 429 || e.code === 429) return t("errTooMany");
  if (e.code === 501) return t("errCredentials");
  if (e.code === 0 && e.status === 0) return t("errUnreachable");
  if (e.code === 0) return t("errNoV2");
  return t("errRefused", { code: e.code });
}
