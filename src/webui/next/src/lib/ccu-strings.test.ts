import { describe, expect, it } from "vitest";
import { catalogUrl, isKey, loadCatalog, parseCatalog, resolveKey } from "./ccu-strings";

const SAMPLE = `jQuery.extend(true,langJSON, {
  "de" : {
    "dummy" : "",
    "sysVarAlarmZone1NotTriggered" : "nicht ausgel%F6st",
    "stringTableAcousticAllsensDelayArm" :
        "Akustisches Signal f%FCr Scharfschaltung",
    "quote" : "say \\"hi\\"",
    "HM-LC-Sw1-Pl": "Funk-Schaltaktor 1-fach, Zwischenstecker",
    "euro" : "%u20AC 5"
  }
});`;

describe("parseCatalog", () => {
  const s = parseCatalog(SAMPLE);
  it("decodes the ISO-8859-1 percent escapes", () => {
    expect(s.sysVarAlarmZone1NotTriggered).toBe("nicht ausgelöst");
    expect(s.stringTableAcousticAllsensDelayArm).toBe("Akustisches Signal für Scharfschaltung");
    expect(s.euro).toBe("€ 5");
  });
  it("reads values on the next line, escaped quotes and keys with dashes", () => {
    expect(s.quote).toBe('say "hi"');
    expect(s["HM-LC-Sw1-Pl"]).toBe("Funk-Schaltaktor 1-fach, Zwischenstecker");
  });
  it("does not take the language name as a key", () => {
    expect(s.de).toBeUndefined();
  });
});

describe("resolveKey", () => {
  const s = { sysVarX: "Wert" };
  it("resolves ${key} only", () => {
    expect(resolveKey("${sysVarX}", s)).toBe("Wert");
    expect(resolveKey("${unknown}", s)).toBeUndefined();
    expect(resolveKey("plain", s)).toBeUndefined();
    expect(isKey("${a}")).toBe(true);
    expect(isKey("a")).toBe(false);
  });
});

describe("loadCatalog", () => {
  it("reads and caches a catalog", async () => {
    let calls = 0;
    const f = (async (u: string) => (calls++, new Response(u.includes("/de/") ? SAMPLE : "x"))) as unknown as typeof fetch;
    const a = await loadCatalog("de", "extension", f);
    const b = await loadCatalog("de", "extension", f);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    expect(catalogUrl("de", "extension")).toBe("/webui/js/lang/de/translate.lang.extension.js");
  });
  it("treats a missing or failing file as an empty catalog", async () => {
    expect(await loadCatalog("en", "stringtable", (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch)).toEqual({});
    expect(await loadCatalog("en", "deviceDescription", (async () => { throw new TypeError("x"); }) as unknown as typeof fetch)).toEqual({});
  });
});
