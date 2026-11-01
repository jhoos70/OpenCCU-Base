const PATHS = {
  minus: "M5 12h14",
  plus: "M12 5v14M5 12h14",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  stop: "M8.5 7h7a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 15.5v-7A1.5 1.5 0 0 1 8.5 7z",
  wifioff: "M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.7M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.8M14 10.3a10 10 0 0 1 5 2.6M12 20h.01",
  battery: "M4 8h13a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2zM22 11v3M6 11v3",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  thermo: "M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z",
  blinds: "M4 4h16M4 9h16M4 14h16M12 14v6",
  plug: "M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  list: "M4 7h16M4 12h10M4 17h16",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  contact: "M5 3h14v18H5zM12 3v18M5 12h14",
  key: "M12 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 12v8M9 17h6",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
} as const;

export type IconName = keyof typeof PATHS;

/** A small line icon (inline, so the app needs no icon package). Decorative: the text next to it says what it means. */
export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg className={`${className} shrink-0`} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
