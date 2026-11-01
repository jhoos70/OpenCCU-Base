// Favourite lists: which of a channel's values a list shows at first sight. The classic page chooses the widgets by the
// channel type (a switch, a dimmer, a thermostat, ...); here the datapoints are generic, so a short list of the
// parameters that matter day to day comes first and the rest is one click away.
import type { Datapoint } from "./api";

/** In the order they are shown. A parameter that is not here is a "more value". */
export const PRIMARY: readonly string[] = [
  "STATE", "LEVEL", "LEVEL_SLATS", "STOP", "OPEN", "LOCK_STATE", "LOCK_TARGET_LEVEL", "WINDOW_STATE",
  "SET_TEMPERATURE", "SET_POINT_TEMPERATURE", "ACTUAL_TEMPERATURE", "TEMPERATURE", "HUMIDITY", "ACTUAL_HUMIDITY",
  "CONTROL_MODE", "BOOST_MODE", "AUTO_MODE", "MANU_MODE", "VALVE_STATE", "MOTION", "BRIGHTNESS", "ILLUMINATION",
  "POWER", "ENERGY_COUNTER", "VOLTAGE", "CURRENT", "FREQUENCY", "SMOKE_DETECTOR_ALARM_STATUS", "PRESS_SHORT", "PRESS_LONG",
];

/**
 * The datapoints of one channel split into what is shown at once and the rest. If none of the usual parameters is there
 * (an unusual channel), the ones that can be operated come first, so the channel is never an empty line.
 */
export function splitDatapoints(items: Datapoint[]): { shown: Datapoint[]; more: Datapoint[] } {
  const rank = (dp: Datapoint) => PRIMARY.indexOf(dp.param);
  const primary = items.filter((d) => rank(d) >= 0).sort((a, b) => rank(a) - rank(b));
  if (primary.length > 0) return { shown: primary, more: items.filter((d) => rank(d) < 0) };
  const writable = items.filter((d) => d.writable);
  if (writable.length > 0) return { shown: writable, more: items.filter((d) => !d.writable) };
  return { shown: items.slice(0, 3), more: items.slice(3) };
}

/** The ids of the channels of a list, in order and without repeats (the same channel can be on a list twice). */
export const channelIds = (items: { id: string; type: string }[]): string[] => [...new Set(items.filter((i) => i.type === "CHANNEL").map((i) => i.id))];
