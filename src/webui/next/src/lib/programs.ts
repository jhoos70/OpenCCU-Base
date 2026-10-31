import type { Program } from "./api";

/** The programs the classic status page lists: those users may operate, not the copies of the editor, not the system's own. */
export const isListed = (p: Program): boolean => p.isOperable && !p.isCopy && !p.isInternal;

/** "" for a program that never ran (the epoch), as the classic list shows a dash there. */
export const neverRan = (p: Program): boolean => p.lastExecuteTime === "" || p.lastExecuteTime.startsWith("1970-");

/** Programs whose name or description contains every word of the query (case-insensitive), by name in the user's language. */
export function filterPrograms(programs: Program[], query: string, lang: string): Program[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return programs
    .filter((p) => isListed(p) && words.every((w) => `${p.name} ${p.description}`.toLowerCase().includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name, lang, { numeric: true }));
}
