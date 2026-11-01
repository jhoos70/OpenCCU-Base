import { describe, expect, it } from "vitest";
import type { SysVar } from "./api";
import { translate } from "./i18n";
import { expand, formatSysVarValue as fmt, isUserVar, text } from "./format";
import type { Strings } from "./ccu-strings";

const v = (o: Partial<SysVar>): SysVar => ({ id: "1", name: "x", type: "STRING", unit: "", value: "", description: "", lastModified: "", isVisible: true, isInternal: false, ...o });

const formatSysVarValue = (x: SysVar, strings: Strings = {}, lang: "en" | "de" = "en") => fmt(x, (k, p) => translate(lang, k, p), strings);

describe("formatSysVarValue", () => {
  it("uses the value names of a logic variable", () => {
    expect(formatSysVarValue(v({ type: "LOGIC", value: "true", valueName0: "away", valueName1: "home" }))).toBe("home");
    expect(formatSysVarValue(v({ type: "LOGIC", value: "false", valueName0: "away", valueName1: "home" }))).toBe("away");
  });
  it("resolves ${key} value names with the CCU strings", () => {
    const strings = { sysVarAlarmZone1NotTriggered: "nicht ausgelöst" };
    expect(formatSysVarValue(v({ type: "ALARM", value: "false", valueName0: "${sysVarAlarmZone1NotTriggered}" }), strings, "de")).toBe("nicht ausgelöst");
  });
  it("does not show raw i18n keys while the strings are missing, but a text in the language of the app", () => {
    expect(formatSysVarValue(v({ type: "ALARM", value: "false", valueName0: "${sysVarAlarmZone1NotTriggered}" }))).toBe("not triggered");
    expect(formatSysVarValue(v({ type: "ALARM", value: "false", valueName0: "${sysVarAlarmZone1NotTriggered}" }), {}, "de")).toBe("nicht ausgelöst");
    expect(formatSysVarValue(v({ type: "LOGIC", value: "true", valueName1: "${x}" }), {}, "de")).toBe("ja");
  });
  it("text() resolves keys and leaves plain text alone", () => {
    expect(text("${a}", { a: "A" })).toBe("A");
    expect(text("${b}", { a: "A" })).toBe("${b}");
    expect(text("plain", {})).toBe("plain");
  });
  it("picks the entry of an enum list and falls back to the raw value", () => {
    expect(formatSysVarValue(v({ type: "LIST", value: "1", valueList: "off;on;auto" }))).toBe("on");
    expect(formatSysVarValue(v({ type: "LIST", value: "7", valueList: "off;on" }))).toBe("7");
  });
  it("writes a number with two decimals and its unit, as the classic list does, in the user's notation", () => {
    expect(formatSysVarValue(v({ type: "NUMBER", value: "21.5", unit: "°C" }))).toBe("21.50 °C");
    expect(formatSysVarValue(v({ type: "NUMBER", value: "-1.000000", unit: "%" }))).toBe("-1.00 %");
    expect(fmt(v({ type: "NUMBER", value: "1234.5" }), (k, p) => translate("de", k, p), {}, "de")).toBe("1.234,50");
    expect(formatSysVarValue(v({ type: "NUMBER", value: "n/a" }))).toBe("n/a");
  });
});

describe("isUserVar", () => {
  it("hides internal and invisible variables", () => {
    expect(isUserVar(v({}))).toBe(true);
    expect(isUserVar(v({ isInternal: true }))).toBe(false);
    expect(isUserVar(v({ isVisible: false }))).toBe(false);
  });
});

describe("expand", () => {
  it("replaces ${key} references inside a longer text and leaves unknown ones", () => {
    const strings = { unknownMessage: "Unbekannte Meldung", deviceLinkOfGroup: "Verknüpfung durch Gruppe " };
    expect(expand("${unknownMessage} (HM-X|UNREACH=TRUE)", strings)).toBe("Unbekannte Meldung (HM-X|UNREACH=TRUE)");
    expect(expand("${a} and ${unknownMessage}", strings)).toBe("${a} and Unbekannte Meldung");
    expect(expand("${deviceLinkOfGroup}9", strings)).toBe("Verknüpfung durch Gruppe 9");
    expect(expand("plain text", strings)).toBe("plain text");
  });
});
