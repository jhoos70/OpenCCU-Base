#!/usr/bin/env python3
"""Browser test of the alarm and service indicators of the nextGen app bar and their two pages.

    python3 next_messages.py --base http://127.0.0.1:18080 --user Admin --password Admin

Real: the counts of the indicators equal the counts of the classic header (the classic UI is the reference),
and the alarm page lists as many rows as the indicator says. Mocked model answers (shape of v2/model.tcl) cover
service messages, which the test CCU does not have: sticky-unreach handling, German texts and ${key}
references, live updates, a failing update, an expired session and the guest. One login for everything.
"""
import argparse, json, re, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon")
PROFILE = {"userId": "1004", "userName": "Admin", "firstName": "Admin", "hasPassword": True, "isNoExpert": True, "language": "", "level": "ADMIN"}


def model(alarms, services):
    sec = lambda items: {"total": len(items), "offset": 0, "limit": 500, "items": items}
    return {"alarms": sec(alarms), "services": sec(services)}


ALARMS = [{"id": "1", "name": "Window open", "occurredAt": "2026-10-30 08:00:00"}, {"id": "2", "name": "Fire", "occurredAt": "2026-10-31 19:35:05"}]
SERVICES = [
    {"id": "10", "occurredAt": "2026-10-31 07:00:00", "channelName": "Kitchen:0", "message": "Low battery", "isSticky": False},
    {"id": "11", "occurredAt": "2026-10-31 08:00:00", "channelName": "Garage:0", "message": "${unknownMessage} (HM-X|UNREACH=TRUE)", "isSticky": True},
    {"id": "12", "occurredAt": "2026-10-30 12:00:00", "channelName": "Hall:0", "message": "Config pending", "isSticky": False},
]


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

    def counts(pg):
        # the accessible names carry the counts: "Alarm messages: 2"
        al = pg.locator("a[href='#/alarms']").get_attribute("aria-label")
        sv = pg.locator("a[href='#/services']").get_attribute("aria-label")
        return int(re.search(r"(\d+)$", al).group(1)), int(re.search(r"(\d+)$", sv).group(1))

    def wait_counts(pg, alarms, services):
        pg.wait_for_function("([a, s]) => { const x = document.querySelector(\"a[href='#/alarms']\"), y = document.querySelector(\"a[href='#/services']\"); return x && y && x.getAttribute('aria-label').endsWith(': ' + a) && y.getAttribute('aria-label').endsWith(': ' + s); }", arg=[alarms, services], timeout=10000)

    state = {"model": None, "hide": 1, "status": 200, "profile": None}

    def on_model(route):
        if state["model"] is None:
            return route.continue_()
        if state["status"] != 200:
            return route.fulfill(status=state["status"], content_type="application/json", body=json.dumps({"error": {"code": 400 if state["status"] == 401 else 200, "message": "x"}}))
        route.fulfill(status=200, content_type="application/json", body=json.dumps(state["model"]))

    def on_rpc(route):
        if state["model"] is not None and '"CCU.getStickyUnreachState"' in (route.request.post_data or ""):
            return route.fulfill(status=200, content_type="application/json", body=json.dumps({"id": 1, "version": "1.1", "result": state["hide"], "error": None}))
        route.continue_()

    def on_profile(route):
        if state["profile"] is None:
            return route.continue_()
        route.fulfill(status=200, content_type="application/json", body=json.dumps({**PROFILE, **state["profile"]}))

    def poll_now(pg):
        pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")  # the app updates at once when the tab is visible again

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1100, "height": 800})
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
        pg.route("**/v2/model?sections=alarms*", on_model)
        pg.route("**/v2/rpc", on_rpc)
        pg.route("**/v2/profile", on_profile)
        try:
            pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.wait_for_selector("a[href='#/alarms']")
            pg.wait_for_function("document.querySelector('[role=status]') && document.querySelector('[role=status]').textContent.length > 0", timeout=15000)

            # ---- real data against the classic header
            real = counts(pg)
            sid = pg.evaluate("JSON.parse(sessionStorage.getItem('openccu.next.session')).sid")
            classic = browser.new_page()
            classic.goto(a.base + "/login.htm"); classic.fill("#UserNameShow", a.user); classic.fill("#Password", a.password); classic.keyboard.press("Enter")
            classic.wait_for_load_state("networkidle"); classic.wait_for_timeout(5000)
            cal = int(re.search(r"\((\d+)\)", classic.inner_text("#msgAlarms")).group(1)); csv = int(re.search(r"\((\d+)\)", classic.inner_text("#msgServices")).group(1))
            classic.evaluate("() => { const e=[...document.querySelectorAll('div')].find(d=>d.innerText.trim()==='Logout' && d.children.length===0); e && e.click(); }"); classic.wait_for_timeout(500); classic.close()
            check("the indicators show the counts of the classic header", real == (cal, csv), "new %s, classic %s" % (real, (cal, csv)))
            pg.locator("a[href='#/alarms']").click(); pg.get_by_role("heading", name="Alarm messages").wait_for()
            pg.wait_for_function("(n) => n === 0 ? /No alarm messages/.test(document.querySelector('main').innerText) : document.querySelectorAll('tbody tr').length === n", arg=real[0], timeout=10000)
            check("the alarm page lists as many alarms as the indicator counts", True, "%d alarm(s)" % real[0])
            green = pg.locator("a[href='#/alarms'] span").first.get_attribute("class")
            check("the dot is red with an alarm and green without", ("bg-red-500" in green) == (real[0] > 0) and ("bg-green-400" in green) == (real[0] == 0), green)

            # ---- mocked service messages: sticky-unreach is not counted while the CCU hides it
            state["model"] = model(ALARMS, SERVICES); state["hide"] = 1
            pg.reload(); wait_counts(pg, 2, 2)
            check("sticky-unreach messages are left out of the count while hidden", counts(pg) == (2, 2), str(counts(pg)))
            amber = pg.locator("a[href='#/services'] span").first.get_attribute("class")
            check("the dot is amber with service messages", "bg-amber-400" in amber, amber)
            pg.locator("a[href='#/services']").click(); pg.get_by_role("heading", name="Service messages").wait_for(); pg.wait_for_selector("tbody tr")
            rows = [r.replace("\t", " | ") for r in pg.locator("tbody tr").all_inner_texts()]
            check("the page lists all three, newest first", len(rows) == 3 and "Garage:0" in rows[0] and "Kitchen:0" in rows[1] and "Hall:0" in rows[2], str(rows))
            check("a sticky message is marked and the note says why the count differs", "Unreachable (sticky)" in rows[0] and pg.get_by_text("1 sticky messages are not counted in the header.").is_visible())
            pg.get_by_role("link", name="Alarm messages: 2").click(); pg.get_by_role("heading", name="Alarm messages").wait_for(); pg.wait_for_selector("tbody tr")
            names = [r.split("\t")[1].strip() for r in pg.locator("tbody tr").all_inner_texts()]
            check("alarms are listed newest first", names == ["Fire", "Window open"], str(names))

            # ---- the CCU shows sticky messages: counted
            state["hide"] = 0
            pg.reload(); wait_counts(pg, 2, 3)
            check("sticky-unreach messages are counted when the CCU shows them", counts(pg) == (2, 3), str(counts(pg)))

            # ---- live update without reload
            state["model"] = model(ALARMS[:1], SERVICES[:1])
            poll_now(pg); wait_counts(pg, 1, 1)
            check("the counts follow the CCU without a reload", counts(pg) == (1, 1))
            state["model"] = model([], [])
            poll_now(pg); wait_counts(pg, 0, 0)
            check("no alarms and no service messages: both counts are 0 and the dots are green", counts(pg) == (0, 0) and "bg-green-400" in pg.locator("a[href='#/services'] span").first.get_attribute("class"))
            pg.get_by_role("link", name="Service messages: 0").click(); pg.get_by_text("No service messages.").wait_for()
            check("an empty service page says so", True)

            # ---- German
            state["model"] = model(ALARMS, SERVICES)
            pg.get_by_role("button", name="Account menu").click(); pg.get_by_role("menuitemradio", name="Deutsch").click()
            wait_counts(pg, 0, 0); poll_now(pg); wait_counts(pg, 2, 3)
            check("the indicators are named in German", pg.locator("a[href='#/alarms']").get_attribute("aria-label") == "Alarmmeldungen: 2" and pg.locator("a[href='#/services']").get_attribute("aria-label") == "Servicemeldungen: 3")
            pg.locator("a[href='#/services']").click(); pg.get_by_role("heading", name="Servicemeldungen").wait_for(); pg.wait_for_selector("tbody tr")
            pg.wait_for_function("document.querySelector('main').innerText.includes('unbekannte Meldung')", timeout=10000)
            body = pg.inner_text("main")
            check("a ${key} inside a message is resolved from the classic strings", "unbekannte Meldung (HM-X|UNREACH=TRUE)" in body and "${" not in body, body.replace("\n", " ")[:160])
            check("times are written the German way", re.search(r"31\.10\.2026.*19:35|31\.10\.2026.*08:00", body) is not None)

            # ---- a failing update keeps the last numbers and says so
            state["status"] = 500
            poll_now(pg); pg.get_by_role("alert").wait_for()
            check("a failing update keeps the last known counts and shows a message", counts(pg) == (2, 3) and "konnten nicht aktualisiert" in pg.get_by_role("alert").inner_text())
            state["status"] = 200; poll_now(pg); pg.get_by_role("alert").wait_for(state="detached")
            check("the message goes away when the update works again", True)
            del console[:]  # the browser logs the deliberate 500 as an error

            # ---- levels
            state["profile"] = {"level": "GUEST"}
            pg.reload(); pg.get_by_text("Für Ihr Konto").wait_for()
            check("a guest sees no indicators", pg.locator("a[href='#/alarms']").count() == 0)
            state["profile"] = {"level": "USER"}
            pg.reload(); pg.wait_for_selector("a[href='#/alarms']")
            check("a user sees the indicators", pg.locator("a[href='#/services']").count() == 1)
            state["profile"] = None

            # ---- an expired session during an update returns to the form
            state["status"] = 401
            poll_now(pg); pg.wait_for_selector("#user", timeout=10000)
            check("an expired session during an update returns to the sign-in form", pg.evaluate("sessionStorage.length") == 0)
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
