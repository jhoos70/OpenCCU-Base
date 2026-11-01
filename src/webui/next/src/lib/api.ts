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
  minValue?: string;
  maxValue?: string;
  description: string;
  lastModified: string; // "2026-10-31 19:34:03" (CCU time); the epoch "1970-01-01 01:00:00" if never set
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
  canAcknowledge: boolean; // the classic rule: no trigger datapoint, or a trigger datapoint that can be written
}

export interface ServiceMsg {
  id: string;
  occurredAt: string;
  channelName: string;
  message: string; // string table text, may contain ${key} references (see ccu-strings.ts)
  isSticky: boolean; // a sticky-unreach message: the classic header may leave it out of the count
  canAcknowledge: boolean;
}

export interface Program {
  id: string;
  name: string;
  description: string;
  lastExecuteTime: string; // "2026-10-31 21:08:42" (CCU time); the epoch if it never ran
  isActive: boolean;
  isInternal: boolean;
  isOperable: boolean; // users may operate it (the classic status list shows only these)
  isCopy: boolean; // an editing artefact the classic list leaves out
}

export interface Model {
  programs: Section<Program>;
  alarms: Section<AlarmMsg>;
  services: Section<ServiceMsg>;
  devices: Section<Device>;
  rooms: Section<Room>;
  functions: Section<Room>; // a function (Gewerk) has the same shape as a room: a name and its channels
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

/** POST /messages: confirms one alarm or service message. `acknowledged` is false if the device raised it again at once. */
export function makeAcknowledge(doFetch: Fetch = defaultFetch): (sid: string, id: string) => Promise<{ id: string; acknowledged: boolean }> {
  return async function acknowledgeMessage(sid: string, id: string) {
    const { doc, status } = await send(doFetch, "/messages", { method: "POST", headers: headersFor(sid, true), body: JSON.stringify({ id }) });
    throwIfError(doc, status);
    const d = doc as { id?: string; acknowledged?: boolean } | null;
    if (!d || typeof d.acknowledged !== "boolean") throw new ApiError(0, "unexpected answer", status);
    return { id: String(d.id ?? id), acknowledged: d.acknowledged };
  };
}
const acknowledgeDefault = makeAcknowledge();
export const acknowledgeMessage = (sid: string, id: string) => acknowledgeDefault(sid, id);

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

/** A value for POST /sysvars: a boolean for a logic variable, else the text (a number is sent as typed, not as a float). */
export type SysVarValue = string | boolean;

export interface SysVarChange {
  id: string;
  value: string;
  lastModified: string;
}

export function makeSetSysVar(doFetch: Fetch = defaultFetch): (sid: string, id: string, value: SysVarValue) => Promise<SysVarChange> {
  return async function setSysVar(sid: string, id: string, value: SysVarValue): Promise<SysVarChange> {
    const { doc, status } = await send(doFetch, "/sysvars", { method: "POST", headers: headersFor(sid, true), body: JSON.stringify({ id, value }) });
    throwIfError(doc, status);
    const d = doc as Partial<SysVarChange> | null;
    if (!d || typeof d.value !== "string") throw new ApiError(0, "unexpected answer", status);
    return { id: String(d.id ?? id), value: d.value, lastModified: String(d.lastModified ?? "") };
  };
}
const setSysVarDefault = makeSetSysVar();
export const setSysVar = (sid: string, id: string, value: SysVarValue): Promise<SysVarChange> => setSysVarDefault(sid, id, value);

/** One datapoint of a device channel (GET /values?device=): the live value and what may be done with it. */
export interface Datapoint {
  id: string;
  name: string;
  channelId: string;
  channel: string;
  param: string; // SET_TEMPERATURE, STATE, ...
  type: string; // LOGIC, ACTION, LIST, NUMBER, STRING
  value: string; // as the CCU holds it ("" or the epoch timestamp: the device never reported one)
  unit: string;
  min: string;
  max: string;
  valueList: string; // ";" separated, for LIST (the value is the index)
  timestamp: string;
  integer: boolean;
  readable: boolean;
  writable: boolean;
}

export function makeGetValues(doFetch: Fetch = defaultFetch): (sid: string, deviceId: string) => Promise<Datapoint[]> {
  return async function getValues(sid: string, deviceId: string): Promise<Datapoint[]> {
    const { doc, status } = await send(doFetch, `/values?device=${encodeURIComponent(deviceId)}`, { method: "GET", headers: headersFor(sid) });
    throwIfError(doc, status);
    const items = (doc as { items?: Datapoint[] } | null)?.items;
    if (!Array.isArray(items)) throw new ApiError(0, "unexpected answer", status);
    return items;
  };
}
const getValuesDefault = makeGetValues();
export const getValues = (sid: string, deviceId: string): Promise<Datapoint[]> => getValuesDefault(sid, deviceId);

/** POST /values: sets one datapoint; the answer is the datapoint as the CCU holds it afterwards (a device confirms later). */
export function makeSetValue(doFetch: Fetch = defaultFetch): (sid: string, id: string, value: string | boolean) => Promise<Datapoint> {
  return async function setValue(sid: string, id: string, value: string | boolean): Promise<Datapoint> {
    const { doc, status } = await send(doFetch, "/values", { method: "POST", headers: headersFor(sid, true), body: JSON.stringify({ id, value }) });
    throwIfError(doc, status);
    const d = doc as Partial<Datapoint> | null;
    if (!d || typeof d.value !== "string" || typeof d.id !== "string") throw new ApiError(0, "unexpected answer", status);
    return d as Datapoint;
  };
}
const setValueDefault = makeSetValue();
export const setValue = (sid: string, id: string, value: string | boolean): Promise<Datapoint> => setValueDefault(sid, id, value);

/** A member of a favourite list: a channel, a system variable, a program, or a separator (an empty line). */
export interface FavouriteItem {
  id: string;
  type: "CHANNEL" | "SYSVAR" | "PROGRAM" | "SEPARATOR";
  name: string;
}
export interface FavouriteList {
  id: string;
  name: string;
  info: string;
  items: FavouriteItem[];
}

export function makeGetFavourites(doFetch: Fetch = defaultFetch): (sid: string) => Promise<FavouriteList[]> {
  return async function getFavourites(sid: string): Promise<FavouriteList[]> {
    const { doc, status } = await send(doFetch, "/favourites", { method: "GET", headers: headersFor(sid) });
    throwIfError(doc, status);
    const lists = (doc as { lists?: FavouriteList[] } | null)?.lists;
    if (!Array.isArray(lists)) throw new ApiError(0, "unexpected answer", status);
    return lists;
  };
}
const getFavouritesDefault = makeGetFavourites();
export const getFavourites = (sid: string): Promise<FavouriteList[]> => getFavouritesDefault(sid);

export interface FavouriteItemInput {
  type: "CHANNEL" | "SYSVAR" | "PROGRAM" | "SEPARATOR";
  id?: string;
}

export interface SaveFavouriteInput {
  id?: string;
  name: string;
  info?: string;
  items: FavouriteItemInput[];
}

/** POST /favourites: creates (when id is omitted) or updates a favourite list of the signed-in user. */
export function makeSaveFavourite(doFetch: Fetch = defaultFetch): (sid: string, list: SaveFavouriteInput) => Promise<FavouriteList> {
  return async function saveFavourite(sid: string, list: SaveFavouriteInput): Promise<FavouriteList> {
    const payload = {
      ...(list.id ? { id: list.id } : {}),
      name: list.name,
      info: list.info ?? "",
      items: list.items.map((i) => (i.type === "SEPARATOR" ? { type: "SEPARATOR" as const } : { type: i.type, id: i.id })),
    };
    const { doc, status } = await send(doFetch, "/favourites", { method: "POST", headers: headersFor(sid, true), body: JSON.stringify(payload) });
    throwIfError(doc, status);
    const d = doc as Partial<FavouriteList> | null;
    if (!d || typeof d.id !== "string" || typeof d.name !== "string" || !Array.isArray(d.items)) throw new ApiError(0, "unexpected answer", status);
    return { id: d.id, name: d.name, info: String(d.info ?? ""), items: d.items };
  };
}
const saveFavouriteDefault = makeSaveFavourite();
export const saveFavourite = (sid: string, list: SaveFavouriteInput): Promise<FavouriteList> => saveFavouriteDefault(sid, list);

/** DELETE /favourites?id=: deletes one favourite list of the signed-in user. */
export function makeDeleteFavourite(doFetch: Fetch = defaultFetch): (sid: string, id: string) => Promise<{ id: string; deleted: boolean }> {
  return async function deleteFavourite(sid: string, id: string): Promise<{ id: string; deleted: boolean }> {
    const { doc, status } = await send(doFetch, `/favourites?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: headersFor(sid) });
    throwIfError(doc, status);
    const d = doc as { id?: string; deleted?: boolean } | null;
    if (!d || typeof d.deleted !== "boolean") throw new ApiError(0, "unexpected answer", status);
    return { id: String(d.id ?? id), deleted: d.deleted };
  };
}
const deleteFavouriteDefault = makeDeleteFavourite();
export const deleteFavourite = (sid: string, id: string): Promise<{ id: string; deleted: boolean }> => deleteFavouriteDefault(sid, id);

/** The server reads at most this many channels in one request. */
export const CHANNELS_PER_REQUEST = 100;

/** GET /values?channels=: the datapoints of a set of channels (a favourite list's members), in as many requests as needed. */
export function makeGetChannelValues(doFetch: Fetch = defaultFetch): (sid: string, channelIds: string[]) => Promise<Datapoint[]> {
  return async function getChannelValues(sid: string, channelIds: string[]): Promise<Datapoint[]> {
    const out: Datapoint[] = [];
    for (let i = 0; i < channelIds.length; i += CHANNELS_PER_REQUEST) {
      const ids = channelIds.slice(i, i + CHANNELS_PER_REQUEST).map(encodeURIComponent).join(",");
      const { doc, status } = await send(doFetch, `/values?channels=${ids}`, { method: "GET", headers: headersFor(sid) });
      throwIfError(doc, status);
      const items = (doc as { items?: Datapoint[] } | null)?.items;
      if (!Array.isArray(items)) throw new ApiError(0, "unexpected answer", status);
      out.push(...items);
    }
    return out;
  };
}
const getChannelValuesDefault = makeGetChannelValues();
export const getChannelValues = (sid: string, channelIds: string[]): Promise<Datapoint[]> => getChannelValuesDefault(sid, channelIds);

/** POST /programs {id, active}: switches a program on or off (administrators only); the answer is the flag as the CCU holds it. */
export function makeSetProgramActive(doFetch: Fetch = defaultFetch): (sid: string, id: string, active: boolean) => Promise<{ id: string; isActive: boolean }> {
  return async function setProgramActive(sid: string, id: string, active: boolean) {
    const { doc, status } = await send(doFetch, "/programs", { method: "POST", headers: headersFor(sid, true), body: JSON.stringify({ id, active }) });
    throwIfError(doc, status);
    const d = doc as { id?: string; isActive?: boolean } | null;
    if (!d || typeof d.isActive !== "boolean") throw new ApiError(0, "unexpected answer", status);
    return { id: String(d.id ?? id), isActive: d.isActive };
  };
}
const setProgramActiveDefault = makeSetProgramActive();
export const setProgramActive = (sid: string, id: string, active: boolean) => setProgramActiveDefault(sid, id, active);

export interface ProgramRun {
  id: string;
  executed: boolean;
  lastExecuteTime: string;
}

export function makeExecuteProgram(doFetch: Fetch = defaultFetch): (sid: string, id: string) => Promise<ProgramRun> {
  return async function executeProgram(sid: string, id: string): Promise<ProgramRun> {
    const { doc, status } = await send(doFetch, "/programs", { method: "POST", headers: headersFor(sid, true), body: JSON.stringify({ id, execute: true }) });
    throwIfError(doc, status);
    const d = doc as Partial<ProgramRun> | null;
    if (!d || typeof d.executed !== "boolean") throw new ApiError(0, "unexpected answer", status);
    return { id: String(d.id ?? id), executed: d.executed, lastExecuteTime: String(d.lastExecuteTime ?? "") };
  };
}
const executeProgramDefault = makeExecuteProgram();
export const executeProgram = (sid: string, id: string): Promise<ProgramRun> => executeProgramDefault(sid, id);

export interface LogValue {
  value: string; // "true"/"false" for a logic or alarm value, a list's index, else the recorded text
  type: string; // LOGIC, ALARM, LIST, NUMBER, STRING
  unit: string;
  valueList: string;
  valueName0: string;
  valueName1: string;
}

export interface LogItem {
  time: string; // "2026-10-31 21:30:35" (CCU time)
  name: string; // the system variable or the channel
  kind: "SYSVAR" | "CHANNEL" | string;
  datapoint: string; // the datapoint of a channel, "" for a system variable
  values: LogValue[]; // the records of one event
}

export interface LogPage {
  total: number; // records in the whole log
  offset: number;
  limit: number;
  items: LogItem[]; // newest first
}

export function makeGetLog(doFetch: Fetch = defaultFetch): (sid: string, limit?: number, offset?: number) => Promise<LogPage> {
  return async function getLog(sid: string, limit = 200, offset = 0): Promise<LogPage> {
    const { doc, status } = await send(doFetch, `/log?limit=${limit}&offset=${offset}`, { method: "GET", headers: headersFor(sid) });
    throwIfError(doc, status);
    const d = doc as Partial<LogPage> | null;
    if (!d || typeof d.total !== "number" || !Array.isArray(d.items)) throw new ApiError(0, "unexpected log", status);
    return { total: d.total, offset: Number(d.offset ?? offset), limit: Number(d.limit ?? limit), items: d.items };
  };
}
const getLogDefault = makeGetLog();
export const getLog = (sid: string, limit?: number, offset?: number): Promise<LogPage> => getLogDefault(sid, limit, offset);

/** Clears the whole system log; answers how many records are left (0 if it worked). */
export function makeClearLog(doFetch: Fetch = defaultFetch): (sid: string) => Promise<{ cleared: boolean; total: number }> {
  return async function clearLog(sid: string) {
    const { doc, status } = await send(doFetch, "/log", { method: "DELETE", headers: headersFor(sid) });
    throwIfError(doc, status);
    const d = doc as { cleared?: boolean; total?: number } | null;
    if (!d || typeof d.cleared !== "boolean") throw new ApiError(0, "unexpected answer", status);
    return { cleared: d.cleared, total: Number(d.total ?? 0) };
  };
}
const clearLogDefault = makeClearLog();
export const clearLog = (sid: string) => clearLogDefault(sid);

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

/** What went wrong with a change, for the user: the server's refusals have their own words, the rest is the common ones. */
export function describeChangeError(e: unknown, t: Translate): string {
  if (e instanceof ApiError && e.status === 422) return t("errInvalidValue");
  if (e instanceof ApiError && e.status === 403) return t("errNotAllowed");
  if (e instanceof ApiError && e.status === 404) return t("errGone");
  if (e instanceof ApiError && e.status === 502) return t("errNotSent");
  return describeError(e, t);
}

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
