#!/usr/bin/env python3
"""Browser test of the duty cycle page of the nextGen UI.

    python3 next_dutycycle.py --base http://127.0.0.1:18080 --password Admin --data mock
    python3 next_dutycycle.py --base http://127.0.0.1:18080 --password Admin --data real   # /tmp/dutycycle.json holds FIXTURE
    python3 next_dutycycle.py --base http://127.0.0.1:18080 --password Admin --data empty  # no /tmp/dutycycle.json

The test CCU has no radio hardware, so the file that OpenCCU's updateDCVars.tcl writes (/tmp/dutycycle.json) is written
by hand for "real": the page then runs through the real API path (Interface.getDutyCycle) with that data. "empty"
is the real answer of a CCU without the file. "mock" answers in the browser and also covers an unknown method, a
failing call, live updates, German and an expired session. Always signs out.
"""
import argparse, json, re, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon")
FIXTURE = [
    {"address": "NEQ0123456", "name": "", "sysVar": "DutyCycle CCU", "dutyCycle": "25", "carrierSense": "3", "type": "CCU2"},
    {"address": "3014F711A0", "name": "Garten", "sysVar": "DutyCycle Garten", "dutyCycle": "75", "carrierSense": "-1", "type": "HMIP-HAP"},
    {"address": "JEQ0987654", "name": "", "sysVar": "DutyCycle JEQ", "dutyCycle": "95", "carrierSense": "25", "type": "HM-LGW-O-TW-W-EU"},
    {"address": "X", "name": "Broken", "sysVar": "", "dutyCycle": "-1", "carrierSense": "", "type": "HMIP-HAP"},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--user", default="Admin")
    ap.add_argument("--password", required=True)
    ap.add_argument("--data", choices=("mock", "real", "empty"), default="mock")
    a = ap.parse_args()
    results, console, sids = [], [], []

    def check(name, ok, detail=""):
        results.append(ok)
        print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    state = {"mode": "data", "data": FIXTURE}

    def on_rpc(route):
        if a.data != "mock" or '"Interface.getDutyCycle"' not in (route.request.post_data or ""):
            return route.continue_()
        if state["mode"] == "unknown":
            return route.fulfill(status=404, content_type="application/json", body=json.dumps({"error": {"code": 401, "message": "unknown method (Interface.getDutyCycle)"}}))
        if state["mode"] == "fail":
            return route.fulfill(status=500, content_type="application/json", body=json.dumps({"error": {"code": 200, "message": "internal error"}}))
        if state["mode"] == "expired":
            return route.fulfill(status=401, content_type="application/json", body=json.dumps({"error": {"code": 400, "message": "access denied"}}))
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"id": 1, "version": "1.1", "result": state["data"], "error": None}))

    def block(pg, label):
        # the section of one interface, found by its heading
        return pg.locator("li", has=pg.get_by_role("heading", name=re.compile("^" + re.escape(label))))

    def meter(sec, name):
        m = sec.get_by_role("meter", name=name)
        return m.get_attribute("aria-valuenow"), m.locator("div").get_attribute("class")

    def check_fixture(pg, suffix=""):
        pg.get_by_role("heading", name="CCU").wait_for()
        labels = [h.strip().split("\n")[0].strip() for h in pg.locator("main h3").all_inner_texts()]
        check("each interface is named like the classic start page" + suffix, [l.split(" ")[0] + (" " + l.split(" ", 1)[1] if " " in l else "") for l in labels] != [] and labels[0].startswith("CCU") and "HAP (Garten)" in labels[1] and "LGW (JEQ0987654)" in labels[2] and "HAP (Broken)" in labels[3], str(labels))
        ccu, hap, lgw, broken = (block(pg, x) for x in ("CCU", "HAP (Garten)", "LGW (JEQ0987654)", "HAP (Broken)"))
        v, c = meter(ccu, "Duty cycle")
        check("a low duty cycle is green" + suffix, v == "25" and "bg-green-500" in c, "%s %s" % (v, c))
        v, c = meter(hap, "Duty cycle")
        check("70 percent is a warning (amber)" + suffix, v == "75" and "bg-amber-400" in c and "Warning" in hap.inner_text(), "%s %s" % (v, c))
        v, c = meter(lgw, "Duty cycle")
        check("90 percent is critical (red) and says so in words" + suffix, v == "95" and "bg-red-500" in c and "Critical" in lgw.inner_text(), "%s %s" % (v, c))
        v, c = meter(ccu, "Carrier sense")
        check("carrier sense is shown when the interface reports it" + suffix, v == "3" and "bg-sky-500" in c, "%s %s" % (v, c))
        check("a carrier sense of 20 percent is critical" + suffix, meter(lgw, "Carrier sense")[0] == "25" and "bg-red-500" in meter(lgw, "Carrier sense")[1])
        check("no carrier sense meter when the interface reports none (-1)" + suffix, hap.get_by_role("meter", name="Carrier sense").count() == 0)
        bt = broken.inner_text()
        check("-1 is shown as not available and not as a bar" + suffix, "n/a" in bt and broken.get_by_role("meter", name="Duty cycle").get_attribute("aria-valuenow") is None, bt.replace("\n", " ")[:80])
        check("the thresholds are explained" + suffix, "Warning from 70 %, critical from 90 %." in pg.inner_text("main") and "Warning from 11 %, critical from 20 %." in pg.inner_text("main"))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1100, "height": 900})
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
        pg.route("**/v2/rpc", on_rpc)
        try:
            pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.wait_for_selector("aside nav a")
            check("the duty cycle is a card of the overview, the landing page", pg.locator("aside nav a[aria-current=page]").inner_text() == "Overview")
            pg.get_by_role("heading", name="Duty cycle", level=2).wait_for()

            if a.data == "empty":
                pg.get_by_text("No radio interface reports a duty cycle.").wait_for()
                check("a CCU without the data file says so (real answer)", "radio module or gateway" in pg.inner_text("main"))
            elif a.data == "real":
                check_fixture(pg, " (real API path)")
            else:
                check_fixture(pg)
                # ---- live update
                state["data"] = [{**FIXTURE[0], "dutyCycle": "92"}]
                pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
                pg.wait_for_function("document.querySelectorAll('main h3').length === 1")
                v, c = meter(block(pg, "CCU"), "Duty cycle")
                check("the page follows the data without a reload", v == "92" and "bg-red-500" in c, "%s %s" % (v, c))
                state["data"] = []
                pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
                pg.get_by_text("No radio interface reports a duty cycle.").wait_for()
                check("an empty list says so", True)
                # ---- errors
                state["mode"] = "unknown"; pg.reload(); pg.get_by_text("not available on this system").wait_for()
                check("a system without the method (plain Base) says so", "function of OpenCCU" in pg.inner_text("main") and pg.get_by_role("alert").count() == 0)
                state["mode"] = "fail"; pg.reload(); pg.get_by_role("alert").wait_for()
                check("a failing call shows a message without internals", "internal" not in pg.get_by_role("alert").inner_text().lower() and "refused" in pg.get_by_role("alert").inner_text())
                del console[:]  # the browser logs the deliberate 404/500 as errors
                # ---- German
                state["mode"] = "data"; state["data"] = FIXTURE; pg.reload(); pg.get_by_role("heading", name="CCU").wait_for()
                pg.get_by_role("button", name="Account menu").click(); pg.get_by_role("menuitemradio", name="Deutsch").click()
                pg.get_by_role("heading", name="Duty Cycle", level=2).wait_for()
                body = pg.inner_text("main")
                check("the page is German", "Warnung" in body and "Kritisch" in body and "n. v." in body and "Warnung ab 70 %, kritisch ab 90 %." in body, body.replace("\n", " ")[:120])
                # ---- narrow screen
                pg.set_viewport_size({"width": 375, "height": 740})
                check("narrow: no sideways page scroll", not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
                pg.set_viewport_size({"width": 1100, "height": 900})
                check("no console errors" + " (before the expired session)", not console, str(console))
                # ---- expired session during an update (the browser logs the deliberate 401 as an error)
                state["mode"] = "expired"
                pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
                pg.wait_for_selector("#user", timeout=10000)
                check("an expired session during an update returns to the sign-in form", pg.evaluate("sessionStorage.length") == 0)
            if a.data != "mock":  # the mock run checks before its deliberate 401
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
