import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCatalog, type Catalog } from "./ccu-strings";

// The real language files of the classic UI: this fails if their format changes under the parser.
const dir = new URL("../../../www/webui/js/lang/", import.meta.url);
const load = (lang: string, catalog: Catalog) => parseCatalog(readFileSync(new URL(`${lang}/translate.lang.${catalog}.js`, dir), "latin1"));

describe("the classic language files", () => {
  it("resolve the value names that system variables use", () => {
    expect(load("de", "extension").sysVarAlarmZone1NotTriggered).toBe("nicht ausgelöst");
    expect(load("en", "extension").sysVarAlarmZone1NotTriggered).toMatch(/not/i);
  });
  it("describe device types", () => {
    expect(load("de", "deviceDescription")["HM-LC-Sw1-Pl"]).toBe("Funk-Schaltaktor 1-fach, Zwischenstecker");
    expect(Object.keys(load("de", "deviceDescription")).length).toBeGreaterThan(100);
  });
  it("yield every plain string literal; only JS concatenations (dialog texts) are skipped", () => {
    for (const c of ["extension", "stringtable", "deviceDescription"] as const) {
      const text = readFileSync(new URL(`de/translate.lang.${c}.js`, dir), "latin1");
      const literals = (text.match(/^\s*"[^"]+"\s*:\s*"/gm) ?? []).length;
      const concatenations = (text.match(/^\s*"[^"]+"\s*:\s*HMIdentifier/gm) ?? []).length;
      expect([c, Object.keys(load("de", c)).length]).toEqual([c, literals]);
      expect(concatenations).toBeLessThan(10); // a growing number means the files moved away from literals
    }
  });
  it("contain no raw percent escapes after decoding umlauts", () => {
    const vals = Object.values(load("de", "stringtable"));
    expect(vals.some((v) => /%[0-9A-F]{2}/.test(v))).toBe(false);
    expect(vals.some((v) => v.includes("ü"))).toBe(true);
  });
});
