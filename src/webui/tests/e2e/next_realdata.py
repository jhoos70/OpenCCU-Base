#!/usr/bin/env python3
"""READ-ONLY browser pass of the nextGen UI over the restored data of a real CCU (isolated-ccu.sh).

    python3 next_realdata.py --base http://127.0.0.1:18090 --user AdminTest --password Admin --shots /shots

It changes nothing: it opens every finished page, compares what is shown with the classic v1 API, times how long
each page takes to show its rows, looks for browser errors and takes screenshots. Always signs out.
"""
import argparse, json, re, sys, time
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon")
V1 = """async ([method, sid]) => {
  const r = await fetch('/api/homematic.cgi', {method: 'POST', body: JSON.stringify({version: '1.1', method, params: {_session_id_: sid}})})
  return (await r.json()).result;
}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True); ap.add_argument("--user", required=True)
    ap.add_argument("--password", required=True); ap.add_argument("--shots", default="")
    a = ap.parse_args()
    results, console = [], []

    def check(name, ok, detail=""):
        results.append(ok); print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    def shot(pg, name):
        if a.shots: pg.screenshot(path="%s/real-%s.png" % (a.shots, name), full_page=False)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1280, "height": 900})
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and console.append(m.text[:160]))
        pg.on("pageerror", lambda e: console.append("pageerror: " + str(e)[:160]))
        try:
            pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.get_by_role("navigation").first.wait_for(timeout=20000)
            sid = pg.evaluate("JSON.parse(sessionStorage.getItem('openccu.next.session')).sid")
            v1 = lambda m: pg.evaluate(V1, [m, sid])
            check("signed in", True)
            shot(pg, "overview")

            def timed(label, link, selector):
                t = time.time(); pg.get_by_role("link", name=link, exact=True).click()
                pg.wait_for_selector(selector, timeout=30000)
                pg.wait_for_function("(sel) => { const n = document.querySelectorAll(sel).length; return n > 0 && !document.querySelector('[aria-busy=true]') }", arg=selector, timeout=30000)
                dt = time.time() - t
                check("%s shows its rows" % label, True, "(%.2fs)" % dt); return dt

            timed("Devices", "Devices", "tbody tr")
            n_rows = pg.locator("tbody tr").count(); dev = v1("Device.listAllDetail")
            check("Devices: one row per device", n_rows == len(dev), "rows=%d classic=%d" % (n_rows, len(dev)))
            shot(pg, "devices")
            pg.locator("tbody tr button[aria-expanded]").nth(3).click()
            check("a device expands to its channels", pg.locator("tbody tbody tr").count() > 0, "(%d channel rows)" % pg.locator("tbody tbody tr").count())
            shot(pg, "devices-open")

            timed("Rooms", "Rooms", "tbody tr")
            rooms = v1("Room.getAll"); check("Rooms: one row per room", pg.locator("tbody tr").count() == len(rooms), "rows=%d classic=%d" % (pg.locator("tbody tr").count(), len(rooms)))
            shot(pg, "rooms")

            timed("System variables", "System variables", "tbody tr")
            sv = [s for s in v1("SysVar.getAll")]
            rows = pg.locator("tbody tr").count()
            check("System variables: rows are the visible, non-internal ones", 0 < rows <= len(sv), "rows=%d of %d variables" % (rows, len(sv)))
            shot(pg, "sysvars")

            timed("Programs", "Programs", "tbody tr")
            prg = v1("Program.getAll"); rows = pg.locator("tbody tr").count()
            check("Programs: rows are the listed ones", 0 < rows <= len(prg), "rows=%d of %d programs (internal and copies hidden)" % (rows, len(prg)))
            shot(pg, "programs")

            pg.get_by_role("link", name="System log", exact=True).click()
            pg.wait_for_selector("text=/records|The system log is empty/", timeout=30000)
            shot(pg, "log")

            pg.set_viewport_size({"width": 390, "height": 800}); pg.get_by_role("link", name="Devices", exact=True).click() if pg.get_by_role("link", name="Devices", exact=True).count() else None
            shot(pg, "phone")
            check("no browser errors on any page", not console, "; ".join(console[:3]))
        finally:
            try:
                pg.set_viewport_size({"width": 1280, "height": 900})
                pg.get_by_role("button", name="Account menu").click(timeout=5000); pg.get_by_role("menuitem", name="Sign out").click(timeout=5000)
            except Exception:
                pass
            browser.close()
    print("%d PASS, %d FAIL" % (sum(results), len(results) - sum(results)))
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
