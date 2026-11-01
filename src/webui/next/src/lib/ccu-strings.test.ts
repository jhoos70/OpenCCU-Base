import { describe, expect, it } from "vitest";
import { catalogUrl, deviceIcon, isKey, loadCatalog, parseCatalog, parseDeviceIcons, resolveKey } from "./ccu-strings";

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
    expect(catalogUrl("de", "base")).toBe("/webui/js/lang/de/translate.lang.js");
  });
  it("treats a missing or failing file as an empty catalog", async () => {
    expect(await loadCatalog("en", "stringtable", (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch)).toEqual({});
    expect(await loadCatalog("en", "deviceDescription", (async () => { throw new TypeError("x"); }) as unknown as typeof fetch)).toEqual({});
  });
});

describe("parseDeviceIcons", () => {
  const js = `
    DEV_PATHS["HM-LC-Sw1-Pl"] = new Object();
    DEV_PATHS["HM-LC-Sw1-Pl"]["50"] = "/config/img/devices/50/16_hm-lc-sw1-pl_thumb.png";
    DEV_PATHS["HM-LC-Sw1-Pl"]["250"] = "/config/img/devices/250/16_hm-lc-sw1-pl.png";
    DEV_PATHS["HMIP-SWDO"]["50"] = "/config/img/devices/50/118_hmip-swdo_thumb.png";
  `;
  it("extracts 50 px thumbnails and matches case-insensitively", () => {
    const icons = parseDeviceIcons(js);
    expect(deviceIcon("HM-LC-Sw1-Pl", icons)).toBe("/config/img/devices/50/16_hm-lc-sw1-pl_thumb.png");
    expect(deviceIcon("HmIP-SWDO", icons)).toBe("/config/img/devices/50/118_hmip-swdo_thumb.png");
    expect(deviceIcon("HmIP-UNKNOWN", icons)).toBeUndefined();
  });
});
