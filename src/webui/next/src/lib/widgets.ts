// The tiles of the Favourites page: which tile a channel gets, which channels of one device share a tile, and how each
// tile reads the datapoints of its channels. Pure functions (the components only draw and send). The datapoint names
// are the ones the CCU reports (checked against the datapoints of real HM and HmIP channels, see the README).
import type { Datapoint, FavouriteItem } from "./api";
import { neverReported } from "./datapoints";

export type Kind = "thermostat" | "shutter" | "switch" | "meter" | "sensor" | "hidden" | "generic";

const KINDS: Record<string, Kind> = {
  CLIMATECONTROL_RT_TRANSCEIVER: "thermostat",
  HEATING_CLIMATECONTROL_TRANSCEIVER: "thermostat",
  CLIMATECONTROL_RECEIVER: "thermostat",
  CLIMATECONTROL_RT_RECEIVER: "thermostat",
  SHUTTER_VIRTUAL_RECEIVER: "shutter",
  BLIND_VIRTUAL_RECEIVER: "shutter",
  SWITCH: "switch",
  SWITCH_TRANSMITTER: "switch",
  SWITCH_VIRTUAL_RECEIVER: "switch",
  POWERMETER: "meter",
  ENERGIE_METER_TRANSMITTER: "meter",
  WEATHER: "sensor",
  WEATHER_TRANSMIT: "sensor",
  // channels that carry no state worth a tile (the weekly schedule of a shutter, the device's own housekeeping)
  BLIND_WEEK_PROFILE: "hidden",
  MAINTENANCE: "hidden",
  "VIP-MAINTENANCE": "hidden",
};
export const kindOf = (channelType: string): Kind => KINDS[channelType] ?? "generic";

/** What the page knows about a channel from the device model. */
export interface ChannelInfo {
  id: string;
  name: string;
  channelType: string;
  deviceId: string;
  deviceAddress: string;
}

/** The name of a tile: without the technical suffix (":1") and the word the CCU adds to a heating group. */
export const tileTitle = (name: string): string => name.replace(/:\d+$/, "").replace(/ Gruppe$/, "");

export type Entry =
  | { type: "tile"; key: string; kind: Exclude<Kind, "hidden">; title: string; channelIds: string[]; deviceAddress: string }
  | { type: "separator"; key: string }
  | { type: "sysvar"; key: string; item: FavouriteItem }
  | { type: "program"; key: string; item: FavouriteItem };

/**
 * The entries of a list in order. The channels of one device that make up one thing (a switch with its feedback and its
 * power meter) share the tile of the first of them; hidden kinds are counted, not shown.
 */
export function buildEntries(items: FavouriteItem[], info: Map<string, ChannelInfo>): { entries: Entry[]; hidden: number } {
  const entries: Entry[] = [];
  let hidden = 0;
  const byDevice = new Map<string, Extract<Entry, { type: "tile" }>>();
  items.forEach((it, i) => {
    const key = `${it.id}-${i}`;
    if (it.type === "SEPARATOR") return void entries.push({ type: "separator", key });
    if (it.type === "SYSVAR") return void entries.push({ type: "sysvar", key, item: it });
    if (it.type === "PROGRAM") return void entries.push({ type: "program", key, item: it });
    const ch = info.get(it.id);
    const kind = kindOf(ch?.channelType ?? "");
    if (kind === "hidden") return void hidden++;
    if (kind === "switch" || kind === "meter") {
      const shared = ch ? byDevice.get(ch.deviceId) : undefined;
      if (shared) {
        if (!shared.channelIds.includes(it.id)) shared.channelIds.push(it.id);
        if (kind === "switch") shared.kind = "switch";
        return;
      }
    }
    const tile: Extract<Entry, { type: "tile" }> = { type: "tile", key, kind, title: tileTitle(it.name), channelIds: [it.id], deviceAddress: ch?.deviceAddress ?? "" };
    entries.push(tile);
    if (ch && (kind === "switch" || kind === "meter")) byDevice.set(ch.deviceId, tile);
  });
  return { entries, hidden };
}

// ---- reading the datapoints of a tile

const num = (dp: Datapoint | undefined): number | null => {
  if (!dp || neverReported(dp) || dp.value.trim() === "") return null;
  const n = Number(dp.value);
  return Number.isFinite(n) ? n : null;
};
const pick = (dps: Datapoint[], ...params: string[]): Datapoint | undefined => {
  for (const p of params) {
    const found = dps.find((d) => d.param === p);
    if (found) return found;
  }
  return undefined;
};
const writable = (dp: Datapoint | undefined): dp is Datapoint => Boolean(dp && dp.writable);

/** The health of the device a tile belongs to: from its maintenance channel (the API adds UNREACH and LOWBAT). */
export function healthOf(all: Datapoint[], deviceAddress: string): { unreachable: boolean; lowBattery: boolean } {
  const mine = all.filter((d) => deviceAddress !== "" && d.name.split(".")[1]?.split(":")[0] === deviceAddress && d.channel.endsWith(":0"));
  const on = (...p: string[]) => mine.some((d) => p.includes(d.param) && d.value === "true");
  return { unreachable: on("UNREACH"), lowBattery: on("LOWBAT", "LOW_BAT") };
}

export type ModeName = "auto" | "manual" | "boost";
export interface ThermostatModel {
  setpoint: Datapoint | null; // the datapoint of the target temperature
  target: number | null;
  actual: number | null;
  humidity: number | null;
  valve: number | null; // percent
  min: number;
  max: number;
  /** which modes can be switched, and what to send; the current one if the device says */
  modes: { name: ModeName; dp: Datapoint; value: string | boolean; expect?: { dp: Datapoint; value: string } }[];
  mode: ModeName | null;
}

export function thermostatModel(dps: Datapoint[]): ThermostatModel {
  const setpoint = pick(dps, "SET_TEMPERATURE", "SET_POINT_TEMPERATURE") ?? null;
  const target = num(setpoint ?? undefined);
  const range = (d: Datapoint | null, k: "min" | "max", fallback: number) => (d && Number.isFinite(Number(d[k])) && d[k] !== "" ? Number(d[k]) : fallback);
  const controlMode = pick(dps, "CONTROL_MODE");
  const pointMode = pick(dps, "SET_POINT_MODE");
  const modeDp = controlMode && !controlMode.writable ? controlMode : pointMode ?? controlMode;
  let modeNum = num(modeDp);
  const boostFlag = pick(dps, "BOOST_MODE");
  const valveDp = pick(dps, "VALVE_STATE");
  const levelDp = pick(dps, "LEVEL");
  const modes: ThermostatModel["modes"] = [];
  const auto = pick(dps, "AUTO_MODE");
  const manu = pick(dps, "MANU_MODE");
  if (writable(auto)) modes.push({ name: "auto", dp: auto, value: true, expect: modeDp ? { dp: modeDp, value: "0" } : undefined });
  else if (writable(pointMode)) modes.push({ name: "auto", dp: pointMode, value: "0", expect: { dp: pointMode, value: "0" } });
  if (writable(manu)) modes.push({ name: "manual", dp: manu, value: target !== null ? String(target) : "20", expect: modeDp ? { dp: modeDp, value: "1" } : undefined });
  else if (writable(pointMode)) modes.push({ name: "manual", dp: pointMode, value: "1", expect: { dp: pointMode, value: "1" } });
  if (writable(boostFlag)) modes.push({ name: "boost", dp: boostFlag, value: true, expect: boostFlag.type === "LOGIC" ? { dp: boostFlag, value: "true" } : undefined });
  const boosting = modeNum === 3 || (boostFlag?.type === "LOGIC" && boostFlag.value === "true");
  if (boosting) modeNum = 3;
  const mode: ModeName | null = modeNum === 0 ? "auto" : modeNum === 1 ? "manual" : modeNum === 3 ? "boost" : null;
  const level = num(levelDp);
  return {
    setpoint,
    target,
    actual: num(pick(dps, "ACTUAL_TEMPERATURE")),
    humidity: num(pick(dps, "ACTUAL_HUMIDITY", "HUMIDITY")),
    valve: valveDp && valveDp.type === "NUMBER" ? num(valveDp) : level !== null ? Math.round(Math.min(level, 1) * 100) : null,
    min: range(setpoint, "min", 4.5),
    max: range(setpoint, "max", 30.5),
    modes,
    mode,
  };
}

export interface ShutterModel {
  level: Datapoint | null;
  percent: number | null; // percent open
  stop: Datapoint | null;
  moving: "up" | "down" | null;
}

export function shutterModel(dps: Datapoint[]): ShutterModel {
  const level = pick(dps, "LEVEL") ?? null;
  const n = num(level ?? undefined);
  const stop = pick(dps, "STOP");
  const act = pick(dps, "ACTIVITY_STATE");
  const idx = num(act);
  return {
    level,
    // HomeMatic: 0 is closed, 1 is open; 1.01 means "unknown", shown as open
    percent: n === null ? null : Math.round(Math.min(Math.max(n, 0), 1) * 100),
    stop: writable(stop) ? stop : null,
    moving: idx === 1 ? "up" : idx === 2 ? "down" : null,
  };
}

export interface SwitchModel {
  state: Datapoint | null; // the one to operate, else the one to read
  watch: Datapoint | null; // the one that says what the switch is doing (the feedback channel if there is one)
  on: boolean | null;
  operable: boolean;
  watts: number | null;
  kwh: number | null;
}

export function switchModel(dps: Datapoint[]): SwitchModel {
  const states = dps.filter((d) => d.param === "STATE");
  const state = states.find((d) => d.writable) ?? states[0] ?? null;
  // a switch with a feedback channel and a control channel: the feedback says what it is, the control what can be done
  const feedback = states.find((d) => !d.writable && !neverReported(d));
  const shown = feedback ?? state;
  const energy = num(pick(dps, "ENERGY_COUNTER"));
  return {
    state,
    watch: shown,
    on: shown && !neverReported(shown) ? shown.value === "true" : null,
    operable: states.some((d) => d.writable),
    watts: num(pick(dps, "POWER")),
    kwh: energy === null ? null : energy / 1000,
  };
}

export interface SensorModel {
  temperature: number | null;
  humidity: number | null;
  brightness: number | null;
}
export const sensorModel = (dps: Datapoint[]): SensorModel => ({
  temperature: num(pick(dps, "TEMPERATURE", "ACTUAL_TEMPERATURE")),
  humidity: num(pick(dps, "HUMIDITY", "ACTUAL_HUMIDITY")),
  brightness: num(pick(dps, "BRIGHTNESS", "ILLUMINATION")),
});

/** Does the datapoint (as the CCU holds it now) have the value that was sent? */
export function matches(dp: Datapoint | undefined, sent: string | boolean): boolean {
  if (!dp || neverReported(dp)) return false;
  const want = String(sent);
  if (dp.type === "NUMBER" || dp.type === "LIST") return Number.isFinite(Number(dp.value)) && Math.abs(Number(dp.value) - Number(want)) < 1e-6;
  return dp.value === want;
}
