import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASSIC_LANDING_PAGES, INDICATOR_ROUTES, NAV, canSee, navFor, showsIndicators } from "./nav";

// The real menu definitions of the classic UI.
const dir = new URL("../../../www/webui/js/mainmenu/", import.meta.url);

/** "menu/submenu" pairs of a classic menu file; a menu without submenu items counts as "menu". */
function classicEntries(level: "admin" | "user"): string[] {
  const out: string[] = [];
  let menu = "";
  let subs = 0;
  const close = () => menu && subs === 0 && out.push(menu);
  for (const line of readFileSync(new URL(`${level}.js`, dir), "latin1").split("\n")) {
    if (/^\s*\/\//.test(line)) continue; // a commented-out entry
    const m = /\{\s*id:\s*"(menu\w+)"/.exec(line);
    if (m) (close(), (menu = m[1]), (subs = 0));
    const s = /\{\s*id:\s*"(submenu\w+)"/.exec(line);
    if (s) (out.push(`${menu}/${s[1]}`), subs++);
  }
  close();
  return out;
}

const admin = classicEntries("admin");
const user = classicEntries("user");
const mapped = NAV.flatMap((i) => i.classic);

describe("the parser of the classic menu files", () => {
  it("finds the entries (guards the test itself)", () => {
    expect(admin).toContain("menuControlPage/submenuDevices");
    expect(admin).toContain("menuSettingsPage/submenuSysControl");
    expect(admin).toContain("menuHelpPage");
    expect(admin).not.toContain("menuSettingsPage/submenuCreateTestPage"); // commented out in the file
    expect(user).not.toContain("menuProgramsLinksPage/submenuDirectLinks");
    expect(admin.length).toBeGreaterThan(20);
  });
});

describe("the nav against the classic menu", () => {
  it("replaces every classic entry (or the landing page of its group)", () => {
    const uncovered = [...new Set([...admin, ...user])].filter((e) => !mapped.includes(e) && !CLASSIC_LANDING_PAGES.includes(e));
    expect(uncovered).toEqual([]);
  });
  it("maps only entries that exist in the classic menu", () => {
    const known = new Set([...admin, ...user]);
    expect(mapped.filter((e) => !known.has(e))).toEqual([]);
  });
  it("maps each classic entry once", () => {
    expect(mapped.filter((e, i) => mapped.indexOf(e) !== i)).toEqual([]);
  });
  it("has no classic equivalent only for the entries that are new in this UI", () => {
    expect(NAV.filter((i) => i.classic.length === 0).map((i) => i.id)).toEqual(["dutycycle"]);
  });
  it("gives every entry the level the classic menu gives it (USER if the user menu has it, else ADMIN)", () => {
    for (const i of NAV.filter((i) => i.classic.length > 0)) {
      const forUser = i.classic.some((e) => user.includes(e));
      expect([i.id, i.minLevel]).toEqual([i.id, forUser ? "USER" : "ADMIN"]);
    }
  });
});

describe("navFor", () => {
  it("shows the built entries of the level, grouped, and points to the classic UI for the rest", () => {
    const a = navFor("ADMIN");
    expect(a.groups.flatMap((g) => g.items.map((i) => i.id))).toEqual(["devices", "rooms", "sysvars", "dutycycle"]);
    expect(a.hasMore).toBe(true);
    expect(navFor("USER").groups.flatMap((g) => g.items.map((i) => i.id))).toEqual(["devices", "rooms", "sysvars", "dutycycle"]);
  });
  it("gives guests and unknown levels nothing, as the classic UI does", () => {
    for (const l of ["GUEST", "NONE"] as const) expect(navFor(l)).toEqual({ groups: [], hasMore: false });
  });
  it("hides admin entries from users", () => {
    expect(canSee({ minLevel: "ADMIN" }, "USER")).toBe(false);
    expect(canSee({ minLevel: "ADMIN" }, "ADMIN")).toBe(true);
    expect(canSee({ minLevel: "USER" }, "USER")).toBe(true);
  });
});

describe("the header indicators", () => {
  it("are shown to users and admins, not to guests or unknown levels, as in the classic header", () => {
    expect(["ADMIN", "USER", "GUEST", "NONE"].map((l) => showsIndicators(l as "ADMIN"))).toEqual([true, true, false, false]);
  });
  it("open pages that are not navigation entries", () => {
    expect(INDICATOR_ROUTES).toEqual(["alarms", "services"]);
    expect(NAV.map((i) => i.id).filter((id) => INDICATOR_ROUTES.includes(id))).toEqual([]);
  });
});
