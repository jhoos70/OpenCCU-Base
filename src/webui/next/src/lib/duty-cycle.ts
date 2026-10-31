// Duty cycle of the radio interfaces (CCU radio module, HmIP access points, LAN gateways). The data is the file the
// OpenCCU script updateDCVars.tcl writes, read with Interface.getDutyCycle (a method added by the OpenCCU rootfs patch
// 0057, not part of this repository's API): [{address, name, sysVar, dutyCycle, carrierSense, type}], numbers as texts.
import type { Translate } from "./i18n";

export interface DutyCycleRaw {
  address?: unknown;
  name?: unknown;
  sysVar?: unknown;
  dutyCycle?: unknown;
  carrierSense?: unknown;
  type?: unknown;
}

export type Severity = "ok" | "warning" | "critical";

export interface Interface {
  address: string;
  name: string;
  type: string;
  /** 0 to 100, or null when the interface reports nothing usable (the classic UI shows "n/a" for -1). */
  dutyCycle: number | null;
  carrierSense: number | null;
}

// The thresholds of the classic start page: a value above these is a warning or critical.
export const DC_WARN = 70; // classic: warning when dc >= 70 %
export const DC_CRITICAL = 90; // attention when dc >= 90 %
export const CS_WARN = 11; // warning when carrier sense >= 11 %
export const CS_CRITICAL = 20; // attention when carrier sense >= 20 %

const percent = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const floor = Math.floor(n);
  return floor >= 0 && floor <= 100 ? floor : null; // -1 means "not available"
};

/** The interfaces of an answer; anything that is not a list (the file is missing) is an empty list. */
export function parseDutyCycle(raw: unknown): Interface[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is DutyCycleRaw => typeof r === "object" && r !== null)
    .map((r) => ({
      address: String(r.address ?? ""),
      name: String(r.name ?? ""),
      type: String(r.type ?? ""),
      dutyCycle: percent(r.dutyCycle),
      carrierSense: percent(r.carrierSense),
    }));
}

export const dutyCycleSeverity = (v: number): Severity => (v >= DC_CRITICAL ? "critical" : v >= DC_WARN ? "warning" : "ok");
export const carrierSenseSeverity = (v: number): Severity => (v >= CS_CRITICAL ? "critical" : v >= CS_WARN ? "warning" : "ok");

/** "CCU", "HAP (Name)", "LGW (Name)": the name, or the address if the interface has none (as the classic start page). */
export function interfaceLabel(i: Interface, t: Translate): string {
  if (i.type === "CCU2") return t("ifaceCcu");
  const who = i.name || i.address;
  return t(i.type === "HMIP-HAP" ? "ifaceHap" : "ifaceLgw", { name: who });
}
