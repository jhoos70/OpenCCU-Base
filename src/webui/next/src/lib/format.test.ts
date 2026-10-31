import { describe, expect, it } from "vitest";
import type { SysVar } from "./api";
import { formatSysVarValue, isUserVar } from "./format";

const v = (o: Partial<SysVar>): SysVar => ({ id: "1", name: "x", type: "STRING", unit: "", value: "", isVisible: true, isInternal: false, ...o });

describe("formatSysVarValue", () => {
  it("uses the value names of a logic variable", () => {
    expect(formatSysVarValue(v({ type: "LOGIC", value: "true", valueName0: "away", valueName1: "home" }))).toBe("home");
    expect(formatSysVarValue(v({ type: "LOGIC", value: "false", valueName0: "away", valueName1: "home" }))).toBe("away");
  });
  it("does not show raw i18n keys", () => {
    expect(formatSysVarValue(v({ type: "ALARM", value: "false", valueName0: "${sysVarAlarmZone1NotTriggered}" }))).toBe("not triggered");
    expect(formatSysVarValue(v({ type: "LOGIC", value: "true", valueName1: "${x}" }))).toBe("yes");
  });
  it("picks the entry of an enum list and falls back to the raw value", () => {
    expect(formatSysVarValue(v({ type: "ENUM", value: "1", valueList: "off;on;auto" }))).toBe("on");
    expect(formatSysVarValue(v({ type: "ENUM", value: "7", valueList: "off;on" }))).toBe("7");
  });
  it("appends the unit of a number", () => {
    expect(formatSysVarValue(v({ type: "NUMBER", value: "21.5", unit: "°C" }))).toBe("21.5 °C");
    expect(formatSysVarValue(v({ type: "NUMBER", value: "3" }))).toBe("3");
  });
});

describe("isUserVar", () => {
  it("hides internal and invisible variables", () => {
    expect(isUserVar(v({}))).toBe(true);
    expect(isUserVar(v({ isInternal: true }))).toBe(false);
    expect(isUserVar(v({ isVisible: false }))).toBe(false);
  });
});
