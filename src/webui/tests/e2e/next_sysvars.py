#!/usr/bin/env python3
"""Browser test of the system variables page of the nextGen UI: status and control.

    python3 next_sysvars.py --base http://127.0.0.1:18080 --user Admin --password Admin

REAL changes on the test CCU, each checked independently (the v1 API, and the classic list): the logic variable
"Anwesenheit" is flipped and put back, and two temporary variables (a number 0..10 and a list) are created and always
deleted again. Mocked answers cover what the test CCU has no variable for (a string), and the server's refusals,
an expired session and the user level. Two logins (the v2 login is rate limited). Run it on a TEST CCU only.
"""
import argparse, json, re, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon")
V1 = """async ([method, sid, params]) => {
  const r = await fetch('/api/homematic.cgi', {method: 'POST', body: JSON.stringify({version: '1.1', method, params: {_session_id_: sid, ...params}})});
  return (await r.json()).result;
}"""
PROFILE = {"userId": "1004", "userName": "Admin", "firstName": "Admin", "hasPassword": True, "isNoExpert": True, "language": "", "level": "ADMIN"}


def item(id, name, type, value, **kw):
    d = {"id": id, "name": name, "description": kw.pop("description", name), "type": type, "unit": "", "value": value, "lastModified": "2026-10-31 10:00:00", "channelId": "65535", "isLogged": False, "isVisible": True, "isInternal": False}
    d.update(kw)
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--user", default="Admin")
    ap.add_argument("--password", required=True)
    a = ap.parse_args()
    results, console, sids, posts = [], [], [], []

    def check(name, ok, detail=""):
        results.append(ok)
        print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    state = {"model": None, "post": None, "profile": None}

    def on_model(route):
        if state["model"] is None:
            return route.continue_()
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"sysvars": {"total": len(state["model"]), "offset": 0, "limit": 500, "items": state["model"]}}))

    def on_post(route):
        if route.request.method != "POST":
            return route.continue_()
        posts.append(route.request.post_data)
        if state["post"] is None:
            return route.continue_()
        status, body = state["post"]
        route.fulfill(status=status, content_type="application/json", body=json.dumps(body))

    def on_profile(route):
        if state["profile"] is None:
            return route.continue_()
        route.fulfill(status=200, content_type="application/json", body=json.dumps({**PROFILE, **state["profile"]}))

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
        pg.route("**/v2/model?sections=sysvars*", on_model)
        pg.route("**/v2/sysvars", on_post)
        pg.route("**/v2/profile", on_profile)
        created, sid = [], None
        anwesenheit_before = None

        def v1(method, **params):
            return pg.evaluate(V1, [method, sid, params])

        def row(name):
            return pg.locator("tbody tr", has=pg.get_by_text(name, exact=True))

        def open_dialog(name):
            pg.get_by_role("button", name="Change: " + name).click()
            pg.get_by_role("dialog").wait_for()

        def wait_value(name, text, timeout=10000):
            pg.wait_for_function("([n, v]) => [...document.querySelectorAll('tbody tr')].some(r => r.innerText.includes(n) && r.innerText.includes(v))", arg=[name, text], timeout=timeout)

        try:
            pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.wait_for_selector("aside nav a")
            sid = pg.evaluate("JSON.parse(sessionStorage.getItem('openccu.next.session')).sid")
            pg.get_by_role("link", name="System variables").click(); pg.get_by_role("heading", name="System variables").wait_for(); pg.wait_for_selector("tbody tr")

            # ---- status: the columns and the values of the classic list
            heads = [h.strip() for h in pg.locator("thead th").all_inner_texts()]
            check("the columns are those of the classic list", heads == ["Name", "Description", "Last modified", "Status"], str(heads))
            ui = {}
            for r in pg.locator("tbody tr").all():
                tds = [t.strip() for t in r.locator("td").all_inner_texts()]
                ui[tds[0]] = [tds[1], tds[2], tds[3].replace("Change: ", "").replace("Change", "").strip()]
            classic = browser.new_page()
            classic.goto(a.base + "/login.htm"); classic.fill("#UserNameShow", a.user); classic.fill("#Password", a.password); classic.keyboard.press("Enter")
            classic.wait_for_load_state("networkidle"); classic.wait_for_timeout(2500)
            classic.evaluate("() => document.getElementById('menuControlPage_TITLE').click()"); classic.wait_for_timeout(400)
            classic.evaluate("() => document.querySelector('#menuControlPage_SUBMENU #submenuSysVar').click()"); classic.wait_for_timeout(2500)
            ref = {}
            for r in classic.locator("tr[id^=sysvar]").all():
                tds = [re.sub(r"\s+", " ", t.replace("\xa0", " ")).strip() for t in r.locator("td").all_inner_texts()]
                ref[tds[0]] = tds[1:4]
            classic.evaluate("() => { const e=[...document.querySelectorAll('div')].find(d=>d.innerText.trim()==='Logout' && d.children.length===0); e && e.click(); }"); classic.wait_for_timeout(500); classic.close()
            norm = lambda s: s.replace(",", "")
            check("the same variables as the classic list", sorted(ui) == sorted(ref), "%s / %s" % (sorted(ui), sorted(ref)))
            diffs = [(k, ui[k], ref[k]) for k in ref if ui[k][0] != ref[k][0] or ui[k][2] != ref[k][2]]
            check("descriptions and values equal the classic list", not diffs, str(diffs)[:200])
            from datetime import datetime
            def ui_time(t):
                return datetime.strptime(t, "%b %d, %Y, %I:%M:%S %p") if t else None
            tdiffs = [(k, ui[k][1], ref[k][1]) for k in ref if (ui_time(ui[k][1]).strftime("%d.%m.%Y %H:%M:%S") if ui[k][1] else "") != ref[k][1]]
            check("last modified is the classic time (blank when never set)", not tdiffs, str(tdiffs))
            check("an alarm variable has no change button", pg.get_by_role("button", name="Change: Alarmzone 1").count() == 0)
            pg.get_by_label("Show internal variables").check()
            check("the system's own variables have none either", pg.get_by_role("button", name=re.compile("^Change: (Alarmmeldungen|Servicemeldungen)")).count() == 0 and pg.locator("tbody tr", has_text="Alarmmeldungen").count() == 1)
            pg.get_by_label("Show internal variables").uncheck()
            pg.get_by_label("Filter").fill("anwes")
            check("the filter narrows the list by name or description", pg.locator("tbody tr").count() == 1 and "Anwesenheit" in pg.inner_text("tbody"))
            pg.get_by_label("Filter").fill("gibtesnicht")
            check("no match says so", pg.get_by_text("No system variable matches the filter.").is_visible())
            pg.get_by_label("Filter").fill("")

            # ---- control: a logic variable, really changed and put back
            anwesenheit_before = v1("SysVar.getValueByName", name="Anwesenheit")
            open_dialog("Anwesenheit")
            dlg = pg.get_by_role("dialog")
            check("the dialog is named like the classic one", dlg.get_by_text("Change system variable value").is_visible() and "Anwesenheit" in dlg.inner_text())
            opts = dlg.locator("select option").all_inner_texts()
            check("a logic variable offers its two value names", opts == ["nicht anwesend", "anwesend"], str(opts))
            check("the current value is selected and OK waits for a change", dlg.locator("select").input_value() == ("true" if anwesenheit_before else "false") and dlg.get_by_role("button", name="OK").is_disabled())
            target = "false" if anwesenheit_before else "true"
            dlg.locator("select").select_option(target)
            del posts[:]
            dlg.get_by_role("button", name="OK").click(); pg.get_by_role("dialog").wait_for(state="detached")
            check("one request was sent: the id and the boolean", len(posts) == 1 and json.loads(posts[0]) == {"id": json.loads(posts[0])["id"], "value": target == "true"}, str(posts))
            wait_value("Anwesenheit", "nicht anwesend" if not anwesenheit_before else "anwesend")
            check("the row shows the new status", True)
            check("the CCU has the new value (checked through the v1 API)", v1("SysVar.getValueByName", name="Anwesenheit") != anwesenheit_before, str(v1("SysVar.getValueByName", name="Anwesenheit")))
            pg.wait_for_function("document.activeElement && document.activeElement.getAttribute('aria-label') === 'Change: Anwesenheit'", timeout=3000)
            check("focus returns to the Change button", True)
            open_dialog("Anwesenheit"); pg.get_by_role("dialog").locator("select").select_option("true" if anwesenheit_before else "false"); pg.get_by_role("dialog").get_by_role("button", name="OK").click(); pg.get_by_role("dialog").wait_for(state="detached")
            check("and put back", v1("SysVar.getValueByName", name="Anwesenheit") == anwesenheit_before)

            # ---- cancel and Escape send nothing
            del posts[:]
            open_dialog("Anwesenheit"); pg.get_by_role("dialog").get_by_role("button", name="Cancel").click(); pg.get_by_role("dialog").wait_for(state="detached")
            open_dialog("Anwesenheit"); pg.keyboard.press("Escape"); pg.get_by_role("dialog").wait_for(state="detached")
            check("Cancel and Escape close the dialog and send nothing", posts == [])

            # ---- a number with limits and a list, on temporary variables
            num = v1("SysVar.createFloat", name="ZZtestnumber", minValue=0, maxValue=10, internal=0, chnID=65535)["name"]; created.append(num)
            lst = v1("SysVar.createEnum", name="ZZtestlist", valList="off;low;high", internal=0, chnID=65535)["name"]; created.append(lst)
            pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
            pg.get_by_text(num, exact=True).wait_for()
            open_dialog(num); dlg = pg.get_by_role("dialog")
            check("a number offers a number field with its limits", dlg.locator("input[type=number]").get_attribute("min") == "0" and dlg.locator("input[type=number]").get_attribute("max") == "10" and "0 to 10" in dlg.inner_text(), dlg.inner_text().replace("\n", " ")[:120])
            dlg.locator("input[type=number]").fill("11")
            check("a value outside the limits is refused in the dialog before sending", dlg.get_by_role("alert").is_visible() and dlg.get_by_role("button", name="OK").is_disabled(), dlg.get_by_role("alert").inner_text() if dlg.get_by_role("alert").count() else "no alert")
            dlg.locator("input[type=number]").fill("7.5")
            check("a valid value enables OK", dlg.get_by_role("button", name="OK").is_enabled() and dlg.get_by_role("alert").count() == 0)
            dlg.locator("input[type=number]").press("Enter"); pg.get_by_role("dialog").wait_for(state="detached")
            wait_value(num, "7.50")
            check("a number is written with two decimals as in the classic list", True)
            check("the CCU has 7.5", abs(float(v1("SysVar.getValueByName", name=num)) - 7.5) < 1e-9, str(v1("SysVar.getValueByName", name=num)))
            open_dialog(lst); dlg = pg.get_by_role("dialog")
            check("a list offers its entries", dlg.locator("select option").all_inner_texts() == ["off", "low", "high"])
            dlg.locator("select").select_option(label="high"); dlg.get_by_role("button", name="OK").click(); pg.get_by_role("dialog").wait_for(state="detached")
            wait_value(lst, "high")
            check("the CCU has index 2 for 'high'", str(v1("SysVar.getValueByName", name=lst)) in ("2", "high"), str(v1("SysVar.getValueByName", name=lst)))

            # ---- a change made elsewhere shows without a reload
            v1("SysVar.setFloat", name=num, value=3)
            pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
            wait_value(num, "3.00")
            check("a change by someone else shows on the next update", True)

            # ---- mocked: a string, the server's refusals, an expired session, German
            state["model"] = [item("7001", "Notiz", "STRING", "hallo", description="Eine Notiz"), item("7002", "Zähler", "NUMBER", "5.000000", minValue="", maxValue="")]
            pg.reload(); pg.get_by_text("Notiz", exact=True).wait_for()
            open_dialog("Notiz"); dlg = pg.get_by_role("dialog")
            check("a string offers a text field of at most 1000 characters", dlg.locator("input[type=text]").get_attribute("maxlength") == "1000" and dlg.locator("input[type=text]").input_value() == "hallo")
            dlg.locator("input[type=text]").fill("neu \"mit\" Anführungszeichen")
            state["post"] = (200, {"id": "7001", "value": "neu \"mit\" Anführungszeichen", "lastModified": "2026-10-31 22:00:00"})
            del posts[:]
            dlg.get_by_role("button", name="OK").click(); pg.get_by_role("dialog").wait_for(state="detached")
            check("the string is sent as it was typed", posts and json.loads(posts[0]) == {"id": "7001", "value": "neu \"mit\" Anführungszeichen"}, str(posts))
            wait_value("Notiz", "Anführungszeichen")
            check("the row shows what the CCU answered, with its time", "Oct 31, 2026" in row("Notiz").inner_text() and "10:00:00 PM" in row("Notiz").inner_text(), row("Notiz").inner_text().replace("\n", " ")[:120])

            for status, body, words, label in ((422, {"error": {"code": 403, "message": "invalid argument (value)"}}, "not valid", "an invalid value (422)"),
                                              (403, {"error": {"code": 400, "message": "access denied"}}, "may not change", "no right (403)"),
                                              (404, {"error": {"code": 501, "message": "system variable not found"}}, "does not exist", "a variable that is gone (404)"),
                                              (500, {"error": {"code": 200, "message": "internal error secret"}}, "refused", "a server error (500)")):
                state["post"] = (status, body)
                open_dialog("Notiz"); dlg = pg.get_by_role("dialog"); dlg.locator("input[type=text]").fill("x%d" % status)
                dlg.get_by_role("button", name="OK").click(); dlg.get_by_role("alert").wait_for()
                msg = dlg.get_by_role("alert").inner_text()
                check("%s: a message in the dialog, which stays open and can be tried again" % label, words in msg and "secret" not in msg and dlg.get_by_role("button", name="OK").is_enabled(), msg)
                dlg.get_by_role("button", name="Cancel").click(); pg.get_by_role("dialog").wait_for(state="detached")
            del console[:]  # the browser logs the deliberate 4xx/5xx as errors

            # ---- German
            pg.get_by_role("button", name="Account menu").click(); pg.get_by_role("menuitemradio", name="Deutsch").click()
            pg.get_by_role("heading", name="Systemvariablen").wait_for()
            check("the page says status and control in German", "Status und Bedienung" in pg.inner_text("main"))
            pg.get_by_role("button", name="Ändern: Zähler").click(); dlg = pg.get_by_role("dialog")
            check("the dialog is German", dlg.get_by_text("Wert der Systemvariablen ändern").is_visible() and dlg.get_by_role("button", name="Abbrechen").is_visible() and dlg.get_by_label("Neuer Wert").is_visible())
            dlg.locator("input[type=number]").fill("")
            check("an empty number field is refused in German", dlg.get_by_role("button", name="OK").is_disabled())
            dlg.get_by_role("button", name="Abbrechen").click()

            # ---- the user level: a user changes, an expired session returns to the form
            state["post"] = None
            pg.get_by_role("button", name="Benutzermenü").click(); pg.get_by_role("menuitemradio", name="English").click()
            state["profile"] = {"level": "USER"}
            pg.reload(); pg.get_by_text("Notiz", exact=True).wait_for()
            check("a user may change variables (as in the classic UI)", pg.get_by_role("button", name="Change: Notiz").is_visible())
            check("no console errors", not console, str(console))
            state["post"] = (401, {"error": {"code": 400, "message": "access denied (session level 0)"}})  # the browser logs the deliberate 401
            open_dialog("Notiz"); dlg = pg.get_by_role("dialog"); dlg.locator("input[type=text]").fill("again"); dlg.get_by_role("button", name="OK").click()
            pg.wait_for_selector("#user", timeout=10000)
            check("an expired session while saving returns to the sign-in form", pg.evaluate("sessionStorage.length") == 0)
        finally:
            state["model"] = None; state["post"] = None; state["profile"] = None
            try:
                if sid:
                    for n in created:
                        v1("SysVar.deleteSysVarByName", name=n)
                    if anwesenheit_before is not None and v1("SysVar.getValueByName", name="Anwesenheit") != anwesenheit_before:
                        v1("SysVar.setBool", name="Anwesenheit", value=1 if anwesenheit_before else 0)
            except Exception as e:
                print("cleanup problem:", e)
            for s in sids:
                try:
                    pg.request.post(a.base + "/api/homematic.cgi/v2/rpc", headers={"Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", "X-Session-Id": s},
                                    data=json.dumps({"version": "1.1", "method": "Session.logout", "params": {}, "id": 1}))
                except Exception:
                    pass
            browser.close()
    print("\n%d PASS, %d FAIL" % (results.count(True), results.count(False)))
    return 1 if False in results else 0


if __name__ == "__main__":
    sys.exit(main())
