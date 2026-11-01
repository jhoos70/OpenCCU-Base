import { describe, expect, it } from "vitest";
import type { Datapoint, FavouriteItem } from "./api";
import { buildEntries, contactModel, dimmerModel, healthOf, keyModel, kindOf, matches, sensorModel, shutterModel, switchModel, thermostatModel, tileTitle, type ChannelInfo } from "./widgets";

const dp = (param: string, o: Partial<Datapoint> = {}): Datapoint => ({
  id: param, name: "BidCos-RF.MEQ1:1." + param, channelId: "1", channel: "x:1", param, type: "NUMBER", value: "1", unit: "", min: "", max: "", valueList: "",
  timestamp: "2026-11-01 10:00:00", integer: false, readable: true, writable: false, ...o,
});
const item = (id: string, type: FavouriteItem["type"], name = "n"): FavouriteItem => ({ id, type, name });
const ch = (id: string, channelType: string, deviceId: string, name = "x:1"): [string, ChannelInfo] => [id, { id, name, channelType, deviceId, deviceAddress: "A" + deviceId }];

describe("kinds and names", () => {
  it("chooses the tile by channel type", () => {
    expect(kindOf("CLIMATECONTROL_RT_TRANSCEIVER")).toBe("thermostat");
    expect(kindOf("HEATING_CLIMATECONTROL_TRANSCEIVER")).toBe("thermostat");
    expect(kindOf("SHUTTER_VIRTUAL_RECEIVER")).toBe("shutter");
    expect(kindOf("SWITCH_VIRTUAL_RECEIVER")).toBe("switch");
    expect(kindOf("ENERGIE_METER_TRANSMITTER")).toBe("meter");
    expect(kindOf("BLIND_WEEK_PROFILE")).toBe("hidden");
    expect(kindOf("SOMETHING_NEW")).toBe("generic");
  });
  it("drops the technical suffix", () => {
    expect(tileTitle("Arbeitszimmer Bettina Gruppe:1")).toBe("Arbeitszimmer Bettina");
    expect(tileTitle("Rollladen Küche:4")).toBe("Rollladen Küche");
    expect(tileTitle("Rollladenautomatik")).toBe("Rollladenautomatik");
  });
});

describe("the entries of a list", () => {
  const info = new Map([ch("1", "SWITCH_TRANSMITTER", "d1"), ch("2", "SWITCH_VIRTUAL_RECEIVER", "d1"), ch("3", "ENERGIE_METER_TRANSMITTER", "d1"), ch("4", "SHUTTER_VIRTUAL_RECEIVER", "d2"), ch("5", "BLIND_WEEK_PROFILE", "d2"), ch("6", "POWERMETER", "d3")]);
  it("shares one tile between the channels of a socket and its meter, keeps order, and counts the hidden", () => {
    const { entries, hidden } = buildEntries([item("4", "CHANNEL"), item("5", "CHANNEL"), item("1", "CHANNEL"), item("0", "SEPARATOR"), item("2", "CHANNEL"), item("3", "CHANNEL"), item("6", "CHANNEL")], info);
    expect(hidden).toBe(1);
    expect(entries.map((e) => (e.type === "tile" ? `${e.kind}:${e.channelIds.join("+")}` : e.type))).toEqual(["shutter:4", "switch:1+2+3", "separator", "meter:6"]);
  });
  it("a meter alone stays a meter; a switch makes the shared tile a switch even if the meter came first", () => {
    const { entries } = buildEntries([item("3", "CHANNEL"), item("2", "CHANNEL")], info);
    expect(entries.length).toBe(1);
    expect(entries[0].type === "tile" && entries[0].kind).toBe("switch");
  });
  it("keeps variables and programs, and shows an unknown channel as generic", () => {
    const { entries } = buildEntries([item("9", "SYSVAR"), item("8", "PROGRAM"), item("77", "CHANNEL")], info);
    expect(entries.map((e) => e.type === "tile" ? e.kind : e.type)).toEqual(["sysvar", "program", "generic"]);
  });
});

describe("a heating tile", () => {
  it("reads an HM heating group: modes by action datapoints, the mode from CONTROL_MODE", () => {
    const m = thermostatModel([
      dp("SET_TEMPERATURE", { value: "21.0", writable: true, min: "5.0", max: "30.0" }), dp("ACTUAL_TEMPERATURE", { value: "19.5" }), dp("ACTUAL_HUMIDITY", { value: "48" }),
      dp("CONTROL_MODE", { type: "LIST", value: "1", valueList: "AUTO-MODE;MANU-MODE;PARTY-MODE;BOOST-MODE" }),
      dp("AUTO_MODE", { type: "ACTION", value: "", writable: true }), dp("MANU_MODE", { value: "", writable: true }), dp("BOOST_MODE", { type: "ACTION", value: "", writable: true }),
    ]);
    expect([m.target, m.actual, m.humidity, m.min, m.max, m.mode]).toEqual([21, 19.5, 48, 5, 30, "manual"]);
    expect(m.modes.map((x) => x.name)).toEqual(["auto", "manual", "boost"]);
    expect(m.modes[1].value).toBe("21"); // manual keeps the current target
    expect(m.modes[0].value).toBe(true);
  });
  it("reads an HmIP heating thermostat: SET_POINT_MODE and BOOST_MODE, the valve from LEVEL", () => {
    const m = thermostatModel([
      dp("SET_POINT_TEMPERATURE", { value: "20.5", writable: true, min: "4.5", max: "30.5" }), dp("HUMIDITY", { value: "40" }), dp("LEVEL", { value: "0.35", writable: true }),
      dp("SET_POINT_MODE", { value: "0", writable: true }), dp("BOOST_MODE", { type: "LOGIC", value: "false", writable: true }),
      dp("VALVE_STATE", { type: "LIST", value: "0", valueList: "STATE_NOT_AVAILABLE;RUN_TO_START" }),
    ]);
    expect([m.target, m.humidity, m.valve, m.mode]).toEqual([20.5, 40, 35, "auto"]);
    expect(m.modes.map((x) => [x.name, x.dp.param, x.value])).toEqual([["auto", "SET_POINT_MODE", "0"], ["manual", "SET_POINT_MODE", "1"], ["boost", "BOOST_MODE", true]]);
  });
  it("shows boost when the device says so, and no values for a device that never reported", () => {
    expect(thermostatModel([dp("SET_POINT_TEMPERATURE", { writable: true }), dp("BOOST_MODE", { type: "LOGIC", value: "true", writable: true })]).mode).toBe("boost");
    const none = thermostatModel([dp("SET_TEMPERATURE", { value: "0.000000", timestamp: "1970-01-01 01:00:00", writable: true })]);
    expect([none.target, none.mode]).toEqual([null, null]);
  });
  it("offers no mode it cannot switch", () => {
    expect(thermostatModel([dp("SET_TEMPERATURE", { writable: true })]).modes).toEqual([]);
  });
});

describe("a shutter tile", () => {
  it("reads 0 as closed and 1 as open, 1.01 as open, and the direction of a move", () => {
    expect(shutterModel([dp("LEVEL", { value: "0.4", writable: true })]).percent).toBe(40);
    expect(shutterModel([dp("LEVEL", { value: "1.01", writable: true })]).percent).toBe(100);
    expect(shutterModel([dp("LEVEL", { value: "0", writable: true })]).percent).toBe(0);
    expect(shutterModel([dp("LEVEL", { value: "0.5" }), dp("ACTIVITY_STATE", { type: "LIST", value: "2" })]).moving).toBe("down");
    expect(shutterModel([dp("LEVEL", { value: "0.5" }), dp("STOP", { type: "ACTION", writable: true })]).stop?.param).toBe("STOP");
  });
});

describe("a switch tile", () => {
  it("operates the control channel and shows the state of the feedback channel, with the power of the meter", () => {
    const m = switchModel([
      dp("STATE", { id: "fb", type: "LOGIC", value: "true" }), dp("STATE", { id: "ctl", type: "LOGIC", value: "false", writable: true }), dp("POWER", { value: "120" }), dp("ENERGY_COUNTER", { value: "3400" }),
    ]);
    expect(m.state?.id).toBe("ctl");
    expect([m.on, m.operable, m.watts, m.kwh]).toEqual([true, true, 120, 3.4]);
  });
  it("is read only when no state can be written, and unknown when never reported", () => {
    expect(switchModel([dp("STATE", { type: "LOGIC", value: "true" })]).operable).toBe(false);
    expect(switchModel([dp("STATE", { type: "LOGIC", value: "false", writable: true, timestamp: "1970-01-01 01:00:00" })]).on).toBeNull();
  });
});

describe("sensors, health and confirmation", () => {
  it("reads a weather sensor", () => expect(sensorModel([dp("TEMPERATURE", { value: "8.5" }), dp("HUMIDITY", { value: "71" })])).toEqual({ temperature: 8.5, humidity: 71, brightness: null, motion: null }));
  it("takes the health of the device from its maintenance channel, matched by the device address", () => {
    const h = [dp("UNREACH", { name: "BidCos-RF.MEQ1:0.UNREACH", channel: "x:0", type: "LOGIC", value: "true" }), dp("LOWBAT", { name: "BidCos-RF.OTHER:0.LOWBAT", channel: "y:0", type: "LOGIC", value: "true" })];
    expect(healthOf(h, "MEQ1")).toEqual({ unreachable: true, lowBattery: false });
    expect(healthOf(h, "OTHER")).toEqual({ unreachable: false, lowBattery: true });
    expect(healthOf(h, "")).toEqual({ unreachable: false, lowBattery: false });
  });
  it("sees when the CCU holds what was sent", () => {
    expect(matches(dp("SET_TEMPERATURE", { value: "21.500000" }), "21.5")).toBe(true);
    expect(matches(dp("SET_TEMPERATURE", { value: "21.000000" }), "21.5")).toBe(false);
    expect(matches(dp("STATE", { type: "LOGIC", value: "true" }), true)).toBe(true);
    expect(matches(dp("STATE", { type: "LOGIC", value: "true" }), false)).toBe(false);
    expect(matches(dp("M", { type: "LIST", value: "1" }), "1")).toBe(true);
    expect(matches(dp("STATE", { type: "LOGIC", value: "true", timestamp: "1970-01-01 01:00:00" }), true)).toBe(false);
    expect(matches(undefined, true)).toBe(false);
  });
});

describe("what a room holds", () => {
  it("chooses tiles for the channel types of rooms and hides the ones that carry nothing", () => {
    expect(kindOf("SHUTTER_CONTACT")).toBe("contact");
    expect(kindOf("THERMALCONTROL_TRANSMIT")).toBe("thermostat");
    expect(kindOf("SHUTTER_TRANSMITTER")).toBe("shutter");
    expect(kindOf("MOTION_DETECTOR")).toBe("sensor");
    expect(kindOf("VIR-LG-WHITE-DIM-CH")).toBe("dimmer");
    expect(kindOf("KEY")).toBe("key");
    expect(kindOf("VIRTUAL_KEY")).toBe("key");
    for (const t of ["KEY_TRANSCEIVER", "WINDOW_SWITCH_RECEIVER", "REMOTECONTROL_RECEIVER", "STATE_RESET_RECEIVER"]) expect(kindOf(t)).toBe("hidden");
  });
  const info = new Map([
    ch("1", "SHUTTER_VIRTUAL_RECEIVER", "d1"), ch("2", "SHUTTER_TRANSMITTER", "d1"), ch("3", "SHUTTER_VIRTUAL_RECEIVER", "d2"),
    ch("4", "HEATING_CLIMATECONTROL_TRANSCEIVER", "h1"), ch("5", "SWITCH_TRANSMITTER", "h1"), ch("6", "SWITCH_TRANSMITTER", "s1"),
    ch("7", "DIMMER_VIRTUAL_RECEIVER", "m1"), ch("8", "DIMMER_TRANSMITTER", "m1"),
  ]);
  it("shares one tile between a shutter and its feedback channel, a dimmer likewise, but not between two devices", () => {
    const { entries } = buildEntries([item("1", "CHANNEL"), item("2", "CHANNEL"), item("3", "CHANNEL"), item("7", "CHANNEL"), item("8", "CHANNEL")], info);
    expect(entries.map((e) => (e.type === "tile" ? `${e.kind}:${e.channelIds.join("+")}` : e.type))).toEqual(["shutter:1+2", "shutter:3", "dimmer:7+8"]);
  });
  it("does not make a tile of the switch feedback of a heating actuator, but keeps a real switch", () => {
    const { entries, hidden } = buildEntries([item("4", "CHANNEL"), item("5", "CHANNEL"), item("6", "CHANNEL")], info);
    expect(entries.map((e) => (e.type === "tile" ? `${e.kind}:${e.channelIds.join("+")}` : e.type))).toEqual(["thermostat:4", "switch:6"]);
    expect(hidden).toBe(1);
  });
  it("keeps the full names when two channels would get the same title", () => {
    const i2 = new Map([ch("21", "KEY", "k1", "Schalter Kaffeemaschine:1"), ch("22", "KEY", "k1", "Schalter Kaffeemaschine:2"), ch("23", "KEY", "k2", "Taster Flur:1")]);
    const { entries } = buildEntries([item("21", "CHANNEL", "Schalter Kaffeemaschine:1"), item("22", "CHANNEL", "Schalter Kaffeemaschine:2"), item("23", "CHANNEL", "Taster Flur:1")], i2);
    expect(entries.map((e) => (e.type === "tile" ? e.title : e.type))).toEqual(["Schalter Kaffeemaschine:1", "Schalter Kaffeemaschine:2", "Taster Flur"]);
  });
  it("reads a window contact, a key, a dimmer and a motion sensor", () => {
    expect(contactModel([dp("STATE", { type: "LOGIC", value: "true" })]).open).toBe(true);
    expect(contactModel([dp("STATE", { type: "LOGIC", value: "false" })]).open).toBe(false);
    expect(contactModel([dp("STATE", { type: "LOGIC", value: "false", timestamp: "1970-01-01 01:00:00" })]).open).toBeNull();
    const k = keyModel([dp("PRESS_SHORT", { type: "ACTION", writable: true }), dp("PRESS_LONG", { type: "ACTION", writable: true })]);
    expect([k.short?.param, k.long?.param]).toEqual(["PRESS_SHORT", "PRESS_LONG"]);
    const d = dimmerModel([dp("LEVEL", { id: "fb", value: "0.5" }), dp("LEVEL", { id: "ctl", value: "0.2", writable: true })]);
    expect([d.level?.id, d.percent, d.operable]).toEqual(["ctl", 50, true]);
    const m = sensorModel([dp("MOTION", { type: "LOGIC", value: "true" }), dp("BRIGHTNESS", { value: "120" })]);
    expect([m.motion, m.brightness]).toEqual([true, 120]);
  });
  it("takes a shutter's position from its feedback channel and operates its control channel; ignores a sensor without a probe", () => {
    const m = shutterModel([dp("LEVEL", { id: "fb", value: "0.3" }), dp("LEVEL", { id: "ctl", value: "0.9", writable: true })]);
    expect([m.level?.id, m.percent]).toEqual(["ctl", 30]);
    expect(sensorModel([dp("ACTUAL_TEMPERATURE", { value: "-3276.8" })]).temperature).toBeNull();
    expect(sensorModel([dp("ACTUAL_TEMPERATURE", { value: "-5" })]).temperature).toBe(-5);
  });
});
