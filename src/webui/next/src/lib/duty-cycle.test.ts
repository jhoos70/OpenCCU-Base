import { describe, expect, it } from "vitest";
import { carrierSenseSeverity, dutyCycleSeverity, interfaceLabel, parseDutyCycle } from "./duty-cycle";
import { translate, type Translate } from "./i18n";

describe("parseDutyCycle", () => {
  it("reads the values the script writes (numbers as texts)", () => {
    const [a] = parseDutyCycle([{ address: "NEQ1", name: "", sysVar: "DutyCycle", dutyCycle: "12", carrierSense: "3", type: "CCU2" }]);
    expect(a).toEqual({ address: "NEQ1", name: "", type: "CCU2", dutyCycle: 12, carrierSense: 3 });
  });
  it("takes -1, an empty text and anything out of range as not available", () => {
    const i = parseDutyCycle([{ dutyCycle: "-1", carrierSense: "" }, { dutyCycle: "101", carrierSense: "abc" }, { dutyCycle: null }, { dutyCycle: 40.9, carrierSense: 0 }]);
    expect(i.map((x) => [x.dutyCycle, x.carrierSense])).toEqual([[null, null], [null, null], [null, null], [40, 0]]);
  });
  it("answers an empty list when the file is missing (null) or the answer is not a list", () => {
    for (const raw of [null, undefined, "", {}, 5]) expect(parseDutyCycle(raw)).toEqual([]);
  });
  it("skips entries that are not objects", () => {
    expect(parseDutyCycle([1, null, "x", { address: "A" }]).map((x) => x.address)).toEqual(["A"]);
  });
});

describe("severity (the thresholds of the classic start page)", () => {
  it("duty cycle: warning from 70, critical from 90", () => {
    expect([0, 69, 70, 89, 90, 100].map(dutyCycleSeverity)).toEqual(["ok", "ok", "warning", "warning", "critical", "critical"]);
  });
  it("carrier sense: warning from 11, critical from 20", () => {
    expect([0, 10, 11, 19, 20, 100].map(carrierSenseSeverity)).toEqual(["ok", "ok", "warning", "warning", "critical", "critical"]);
  });
});

describe("interfaceLabel", () => {
  const t: Translate = (k, p) => translate("en", k, p);
  const base = { address: "ADDR", name: "", dutyCycle: 1, carrierSense: null };
  it("names the CCU, and an access point or gateway by name or else by address", () => {
    expect(interfaceLabel({ ...base, type: "CCU2" }, t)).toBe("CCU");
    expect(interfaceLabel({ ...base, type: "HMIP-HAP", name: "Garden" }, t)).toBe("HAP (Garden)");
    expect(interfaceLabel({ ...base, type: "HMIP-HAP" }, t)).toBe("HAP (ADDR)");
    expect(interfaceLabel({ ...base, type: "HM-LGW-O-TW-W-EU" }, t)).toBe("LGW (ADDR)");
  });
});
