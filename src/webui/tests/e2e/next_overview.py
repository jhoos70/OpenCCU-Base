#!/usr/bin/env python3
"""Browser test of the overview page of the nextGen UI (the classic start page).

    python3 next_overview.py --base http://127.0.0.1:18080 --user Admin --password Admin

Real: date, sunrise, sunset and the firmware version are compared with the classic start page, the time within a
minute. Mocked: a ticking clock (the browser clock is controlled), an unreadable time, a failing system call (the
other cards stay), the password hint, German and the layout. Two logins at most (the v2 login is rate limited).
"""
import argparse, json, re, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon")
PROFILE = {"userId": "1004", "userName": "Admin", "firstName": "Admin", "hasPassword": True, "isNoExpert": True, "language": "", "level": "ADMIN"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--user", default="Admin")
    ap.add_argument("--password", required=True)
    a = ap.parse_args()
    results, console, sids = [], [], []

    def check(name, ok, detail=""):
        results.append(ok)
        print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    state = {"system": None, "status": 200, "profile": None}

    def on_system(route):
        if state["system"] is None:
            return route.continue_()
        if state["status"] != 200:
            return route.fulfill(status=state["status"], content_type="application/json", body=json.dumps({"error": {"code": 200, "message": "internal"}}))
        route.fulfill(status=200, content_type="application/json", body=json.dumps(state["system"]))

    def on_profile(route):
        if state["profile"] is None:
            return route.continue_()
        route.fulfill(status=200, content_type="application/json", body=json.dumps({**PROFILE, **state["profile"]}))

    def rows(pg):
        # label -> value of the system card
        dts = [t.strip() for t in pg.locator("main dl dt").all_inner_texts()]
        dds = [t.strip() for t in pg.locator("main dl dd").all_inner_texts()]
        return dict(zip(dts, dds))

    def minutes(hhmm):
        h, m = (int(x) for x in hhmm.split(":"))
        return h * 60 + m

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(locale="de-DE", viewport={"width": 1100, "height": 900})
        pg = ctx.new_page()

        def on_response(r):
            try:
                if r.request.method == "POST" and '"Session.login"' in (r.request.post_data or "") and r.ok:
                    sid = r.json().get("result")
                    if isinstance(sid, str):
                        sids.append(sid)
            except Exception:
                pass

        pg.on("response", on_response)
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and console.append(m.text[:140]))
        pg.route("**/v2/system", on_system)
        pg.route("**/v2/profile", on_profile)
        try:
            pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.get_by_role("heading", name="System", level=2).wait_for()
            pg.wait_for_selector("main dl dd")

            # ---- real values against the classic start page
            ui = rows(pg)
            classic = browser.new_page()
            classic.goto(a.base + "/login.htm"); classic.fill("#UserNameShow", a.user); classic.fill("#Password", a.password); classic.keyboard.press("Enter")
            classic.wait_for_load_state("networkidle"); classic.wait_for_selector("#currentFirmware"); classic.wait_for_function("document.getElementById('currentFirmware').innerText.trim() !== '--'", timeout=15000)
            # OpenCCU's start page shows "31.10.2026, 20:32 o'clock" and "07:08 - 16:32 o'clock" (one field each)
            raw = {k: classic.inner_text("#" + k).replace("\xa0", " ").strip() for k in ("maintime", "sunrise", "currentFirmware")}
            classic.evaluate("() => { const e=[...document.querySelectorAll('div')].find(d=>d.innerText.trim()==='Logout' && d.children.length===0); e && e.click(); }"); classic.wait_for_timeout(500); classic.close()
            dt = re.match(r"(\d{2}\.\d{2}\.\d{4}),\s*(\d{1,2}:\d{2})", raw["maintime"])
            sun = re.match(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", raw["sunrise"])
            ref = {"maindate": dt.group(1), "maintime": dt.group(2), "sunrise": sun.group(1), "sunset": sun.group(2), "currentFirmware": raw["currentFirmware"]}
            check("the firmware version is the classic one", ui["Firmwareversion"] == ref["currentFirmware"], "%s / %s" % (ui["Firmwareversion"], ref["currentFirmware"]))
            check("sunrise and sunset are the classic ones", (ui["Sonnenaufgang"], ui["Sonnenuntergang"]) == (ref["sunrise"], ref["sunset"]), "%s %s / %s %s" % (ui["Sonnenaufgang"], ui["Sonnenuntergang"], ref["sunrise"], ref["sunset"]))
            check("the date is the classic one", ui["Datum"] == ref["maindate"], "%s / %s" % (ui["Datum"], ref["maindate"]))
            d = abs(minutes(ui["Uhrzeit"]) - minutes(ref["maintime"]))
            check("the time is the classic one (within a minute)", min(d, 1440 - d) <= 1, "%s / %s" % (ui["Uhrzeit"], ref["maintime"]))
            check("the cards of the classic start page are there", pg.get_by_role("heading", name="Duty Cycle", level=2).is_visible() and pg.get_by_role("heading", name="Favoriten", level=2).is_visible())
            check("a password is set: no hint", pg.get_by_role("note").count() == 0)
            check("the page has one h1 (for screen readers) and cards with h2", pg.locator("main h1").count() == 1 and pg.locator("main h2").count() >= 3)
            check("the favourites card links to the classic UI with the session", "/pages/index.htm?sid=@" in pg.get_by_role("link", name="Klassische Oberfläche öffnen").last.get_attribute("href"))

            # ---- mocked: the clock follows the browser clock between two answers
            state["system"] = {"time": "2026-10-31 19:59:45", "sunrise": "07:08", "sunset": "16:32", "firmwareVersion": "9.9.9.20260101"}
            pg.clock.install()
            pg.reload(); pg.wait_for_function("document.querySelector('main dl') && document.querySelector('main dl').innerText.includes('9.9.9')")
            check("the mocked time is shown", rows(pg)["Uhrzeit"] == "19:59" and rows(pg)["Datum"] == "31.10.2026", str(rows(pg)))
            pg.clock.run_for(30_000)
            check("30 seconds later the minute has changed (the clock runs on its own)", rows(pg)["Uhrzeit"] == "20:00", rows(pg)["Uhrzeit"])
            pg.clock.run_for(30_000 * 3)  # the minute poll runs, answers the same time again, the clock is set right
            check("after the next answer of the CCU it is set right again", rows(pg)["Uhrzeit"] in ("19:59", "20:00", "20:01"), rows(pg)["Uhrzeit"])

            # ---- an unreadable time is not guessed
            state["system"] = {"time": "", "sunrise": "", "sunset": "", "firmwareVersion": ""}
            pg.reload(); pg.get_by_role("term").first.wait_for()
            vals = rows(pg)
            check("values the CCU cannot give are shown as a dash, not as a guess", all(v == "—" for v in vals.values()) and len(vals) == 5, str(vals))

            # ---- a failing system call: a message, the other cards stay
            state["status"] = 500
            pg.reload(); pg.get_by_role("alert").first.wait_for()
            check("a failing call shows a message without internals", "internal" not in " ".join(pg.get_by_role("alert").all_inner_texts()).lower())
            check("the other cards stay", pg.get_by_role("heading", name="Duty Cycle", level=2).is_visible() and pg.get_by_role("heading", name="Favoriten", level=2).is_visible())
            state["status"] = 200
            del console[:]  # the browser logs the deliberate 500 as an error

            # ---- no password hint
            state["system"] = {"time": "2026-10-31 19:59:45", "sunrise": "07:08", "sunset": "16:32", "firmwareVersion": "1.2.3"}
            state["profile"] = {"hasPassword": False}
            pg.reload(); pg.get_by_role("note").wait_for()
            check("an account without a password gets a hint", "Kein Kennwort" in pg.get_by_role("note").inner_text() or "kein Kennwort" in pg.get_by_role("note").inner_text(), pg.get_by_role("note").inner_text())
            state["profile"] = None

            # ---- narrow screen
            pg.reload(); pg.get_by_role("term").first.wait_for()
            pg.set_viewport_size({"width": 375, "height": 740})
            check("narrow: no sideways page scroll", not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
            check("no console errors", not console, str(console))
        finally:
            for sid in sids:
                try:
                    pg.request.post(a.base + "/api/homematic.cgi/v2/rpc", headers={"Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", "X-Session-Id": sid},
                                    data=json.dumps({"version": "1.1", "method": "Session.logout", "params": {}, "id": 1}))
                except Exception:
                    pass
            browser.close()
    print("\n%d PASS, %d FAIL" % (results.count(True), results.count(False)))
    return 1 if False in results else 0


if __name__ == "__main__":
    sys.exit(main())
