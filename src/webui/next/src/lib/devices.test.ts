import { describe, expect, it } from "vitest";
import type { Device } from "./api";
import { filterDevices, sortByName } from "./devices";

const d = (o: Partial<Device>): Device => ({ id: "1", name: "x", address: "A", interface: "HmIP-RF", type: "T", isReady: true, channels: [], ...o });
const devices = [
  d({ id: "1", name: "Küche Heizung", type: "HmIP-eTRV-B", address: "0001" }),
  d({ id: "2", name: "Büro Licht", type: "HM-LC-Sw1-Pl", address: "0002", interface: "BidCos-RF" }),
  d({ id: "3", name: "Aktor 10", type: "HM-LC-Sw1-Pl", address: "0003" }),
  d({ id: "4", name: "Aktor 2", type: "HM-LC-Sw1-Pl", address: "0004" }),
];
const describe_ = (x: Device) => (x.type === "HmIP-eTRV-B" ? "Heizkörperthermostat" : "Schaltaktor");

describe("filterDevices", () => {
  it("returns all devices for an empty query", () => {
    expect(filterDevices(devices, "  ", describe_)).toHaveLength(4);
  });
  it("matches name, type, description, address and interface; all words must match", () => {
    expect(filterDevices(devices, "küche", describe_).map((x) => x.id)).toEqual(["1"]);
    expect(filterDevices(devices, "etrv", describe_).map((x) => x.id)).toEqual(["1"]);
    expect(filterDevices(devices, "heizkörper", describe_).map((x) => x.id)).toEqual(["1"]);
    expect(filterDevices(devices, "0002", describe_).map((x) => x.id)).toEqual(["2"]);
    expect(filterDevices(devices, "bidcos licht", describe_).map((x) => x.id)).toEqual(["2"]);
    expect(filterDevices(devices, "bidcos küche", describe_)).toEqual([]);
  });
});

describe("sortByName", () => {
  it("sorts by name in the language of the user, numbers numerically, without changing the input", () => {
    expect(sortByName(devices, "de").map((x) => x.name)).toEqual(["Aktor 2", "Aktor 10", "Büro Licht", "Küche Heizung"]);
    expect(devices[0].name).toBe("Küche Heizung");
  });
});
