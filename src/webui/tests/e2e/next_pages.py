#!/usr/bin/env python3
"""Browser test of the nextGen pages (Devices, Rooms, System variables) against a CCU with v2_enabled.

    python3 next_pages.py --base http://127.0.0.1:18080 --user Admin --password Admin

What the pages show is compared with the classic v1 API (Room.getAll, SysVar.getAll), which is
independent of the v2 model the pages read. Also: tab navigation and reload, internal variables
hidden by default, umlauts intact, an expired session returns to the sign-in form. Always signs out.
"""
import argparse, json, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon")

V1 = """async ([method, sid]) => {
  const r = await fetch('/api/homematic.cgi', {method: 'POST', body: JSON.stringify({version: '1.1', method, params: {_session_id_: sid}})});
  return (await r.json()).result;
}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--user", default="Admin")
    ap.add_argument("--password", required=True)
    a = ap.parse_args()
    results, console = [], []

    def check(name, ok, detail=""):
        results.append(ok)
        print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    def column(pg, n):
        return [t.strip() for t in pg.locator("tbody tr td:nth-child(%d)" % n).all_inner_texts()]

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1100, "height": 800})
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and console.append(m.text[:140]))
        signed_in = False
        try:
            pg.goto(a.base + "/webui/next/")
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.get_by_role("button", name="Account menu").wait_for()
            signed_in = True
            sid = pg.evaluate("JSON.parse(sessionStorage.getItem('openccu.next.session')).sid")

            # ---- devices (default page): this CCU has none, the empty state is the real answer
            pg.get_by_text("No devices available.").wait_for()
            check("devices is the default page", pg.locator("h1").inner_text() == "Devices")

            # ---- rooms
            pg.get_by_role("link", name="Rooms").click()
            pg.wait_for_selector("tbody tr")
            check("tab sets the route", "#/rooms" in pg.url)
            ui_rooms = sorted(column(pg, 1))
            v1_rooms = sorted(r["name"] for r in pg.evaluate(V1, ["Room.getAll", sid]))
            check("rooms equal the classic API", ui_rooms == v1_rooms, "%d rooms" % len(ui_rooms))
            check("umlauts are intact", any("ü" in n or "ä" in n or "ö" in n for n in ui_rooms) and not any("Ã" in n or "\ufffd" in n for n in ui_rooms), str([n for n in ui_rooms if not n.isascii()][:3]))

            # ---- system variables
            pg.get_by_role("link", name="System variables").click()
            pg.wait_for_selector("h1:text('System variables')"); pg.wait_for_selector("tbody tr")
            check("sysvars tab sets the route", "#/sysvars" in pg.url)
            v1_vars = pg.evaluate(V1, ["SysVar.getAll", sid])
            visible = sorted(column(pg, 1))
            check("internal variables are hidden by default", "Alarmmeldungen" not in visible and len(visible) < len(v1_vars), "%d of %d shown" % (len(visible), len(v1_vars)))
            pg.get_by_label("Show internal variables").check()
            all_ui = sorted(column(pg, 1))
            check("all variables equal the classic API", all_ui == sorted(v["name"] for v in v1_vars), "%d variables" % len(all_ui))
            row = pg.locator("tbody tr", has_text="Anwesenheit")
            check("a logic variable shows its value name", row.count() == 1 and row.locator("td:nth-child(3)").inner_text().strip() in ("anwesend", "nicht anwesend"), row.inner_text() if row.count() else "missing")

            pg.reload(); pg.wait_for_selector("h1:text('System variables')"); pg.wait_for_selector("tbody tr")
            check("reload keeps the page", "#/sysvars" in pg.url and pg.locator("tbody tr").count() > 0)
            check("no console errors", not console, str(console))
            del console[:]

            # ---- the session ends behind the app's back (classic logout): the next page load returns to the form
            pg.evaluate(V1, ["Session.logout", sid])
            pg.get_by_role("link", name="Rooms").click()
            pg.wait_for_selector("#user", timeout=10000)
            signed_in = False
            check("an expired session returns to the sign-in form", pg.evaluate("sessionStorage.length") == 0)
        finally:
            if signed_in:
                try:
                    pg.get_by_role("button", name="Account menu").click(timeout=5000); pg.get_by_role("menuitem", name="Sign out").click(timeout=5000)
                except Exception:
                    pass
            browser.close()
    print("\n%d PASS, %d FAIL" % (results.count(True), results.count(False)))
    return 1 if False in results else 0


if __name__ == "__main__":
    sys.exit(main())
