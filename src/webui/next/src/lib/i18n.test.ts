import { describe, expect, it } from "vitest";
import { detectLang, translate } from "./i18n";
import { de, en } from "./messages";

describe("catalogs", () => {
  it("German has exactly the English keys and no empty text", () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(de)) expect([k, v.trim() !== ""]).toEqual([k, true]);
  });
  it("uses the same placeholders in both languages", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect([k, ph(de[k])]).toEqual([k, ph(en[k])]);
  });
});

describe("translate", () => {
  it("fills placeholders and keeps unknown ones", () => {
    expect(translate("en", "showingOf", { shown: 3, total: 9 })).toBe("Showing 3 of 9.");
    expect(translate("de", "showingOf", { shown: 3, total: 9 })).toBe("3 von 9 angezeigt.");
    expect(translate("en", "showingOf", { shown: 3 })).toBe("Showing 3 of {total}.");
  });
});

describe("detectLang", () => {
  it("prefers the stored choice, then the browser language", () => {
    expect(detectLang("en-US", "de")).toBe("de");
    expect(detectLang("de-AT", null)).toBe("de");
    expect(detectLang("fr-FR", null)).toBe("en");
    expect(detectLang(undefined, "xx")).toBe("en");
  });
});
