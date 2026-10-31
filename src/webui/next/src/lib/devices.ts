import type { Device } from "./api";

/** Devices whose name, type, description or address contains every word of the query (case-insensitive). */
export function filterDevices(devices: Device[], query: string, describe: (d: Device) => string): Device[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return devices;
  return devices.filter((d) => {
    const hay = `${d.name} ${d.type} ${describe(d)} ${d.address} ${d.interface}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export const sortByName = (devices: Device[], lang: string): Device[] => [...devices].sort((a, b) => a.name.localeCompare(b.name, lang, { numeric: true }));
