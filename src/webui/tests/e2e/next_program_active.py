#!/usr/bin/env python3
"""Browser test of switching programs on and off (the Active column of the Programs page).

    python3 next_program_active.py --base http://127.0.0.1:18080 --user Admin --password Admin

The model and POST /programs are mocked: switching a program changes how the CCU behaves, which a test must not do on a
CCU (the route is proven by the Tcl tests and against the restored real data). Login, profile and the page are real.
Checks: the Active column; administrators get a switch that shows the state, a switch sends {id, active} and the row and the
message follow; a refusal leaves the switch where it was and says why; a user sees yes / no and no switch (but can still run
a program); German; an expired session. Always signs out.
"""
import argparse, json, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon", "Failed to load resource")
PROFILE = {"userId": "1004", "userName": "Admin", "firstName": "Admin", "hasPassword": True, "isNoExpert": True, "language": "", "level": "ADMIN"}


def prog(id, name, active, **kw):
    d = {"id": id, "name": name, "description": "", "lastExecuteTime": "2026-11-01 10:00:00", "isActive": active, "isInternal": False, "isOperable": True, "isCopy": False}
    d.update(kw)
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True); ap.add_argument("--user", default="Admin"); ap.add_argument("--password", required=True)
    a = ap.parse_args()
    results, console, posts = [], [], []

    def check(name, ok, detail=""):
        results.append(ok); print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    st = {"progs": [prog("1", "Licht an", True), prog("2", "Licht aus", False), prog("3", "System", True, isInternal=True)], "refuse": False, "profile": None, "status": 200}
    ok = lambda body: dict(status=200, content_type="application/json", body=json.dumps(body))

    def on_model(route):
        if st["status"] != 200:
            return route.fulfill(status=st["status"], content_type="application/json", body=json.dumps({"error": {"code": 400, "message": "x"}}))
        route.fulfill(**ok({"programs": {"total": len(st["progs"]), "offset": 0, "limit": 500, "items": st["progs"]}}))

    def on_post(route):
        if route.request.method != "POST":
            return route.continue_()
        body = json.loads(route.request.post_data)
        posts.append(body)
        if st["refuse"]:
            return route.fulfill(status=403, content_type="application/json", body=json.dumps({"error": {"code": 400, "message": "access denied"}}))
        if "active" in body:
            p = next(x for x in st["progs"] if x["id"] == body["id"]); p["isActive"] = body["active"]
            return route.fulfill(**ok({"id": body["id"], "isActive": body["active"]}))
        route.fulfill(**ok({"id": body["id"], "executed": True, "lastExecuteTime": "2026-11-01 11:00:00"}))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1200, "height": 800})
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and console.append(m.text[:140]))
        pg.on("pageerror", lambda e: console.append("pageerror: " + str(e)[:140]))
        pg.route("**/v2/model?sections=programs*", on_model)
        pg.route("**/v2/programs", on_post)
        pg.route("**/v2/profile", lambda r: r.fulfill(**ok({**PROFILE, **(st["profile"] or {})})))
        try:
            pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.get_by_role("link", name="Programs", exact=True).click(); pg.wait_for_selector("tbody tr")
            sw = lambda name: pg.get_by_role("switch", name="Active: " + name)

            check("the table has an Active column", "Active" in pg.locator("thead th").all_inner_texts())
            check("an internal program is not listed", pg.locator("tbody").get_by_text("System", exact=True).count() == 0)
            check("an administrator has a switch per program that shows the state", sw("Licht an").get_attribute("aria-checked") == "true" and sw("Licht aus").get_attribute("aria-checked") == "false")

            # activating asks first: the CCU checks the conditions of a program when it is activated and it can run at once
            before = len(posts)
            sw("Licht aus").click()
            dlg = pg.get_by_role("dialog")
            dlg.wait_for()
            check("activating asks first and warns that the program can run at once", "Activate this program?" in dlg.inner_text() and "can run at once" in dlg.inner_text() and len(posts) == before)
            check("Cancel has the focus, so a stray Enter activates nothing", dlg.get_by_role("button", name="Cancel").evaluate("e => e === document.activeElement"))
            dlg.get_by_role("button", name="Cancel").click()
            dlg.wait_for(state="hidden")
            check("Cancel sends nothing and the switch stays off", len(posts) == before and sw("Licht aus").get_attribute("aria-checked") == "false")
            sw("Licht aus").click()
            pg.get_by_role("dialog").get_by_role("button", name="Activate").click()
            pg.get_by_text("Licht aus is now active.").wait_for(timeout=10000)
            check("a switch sends the id and a boolean", posts[-1] == {"id": "2", "active": True}, repr(posts[-1]))
            check("the row follows and the result is announced", sw("Licht aus").get_attribute("aria-checked") == "true" and "is now active" in pg.locator("[role=status]").last.inner_text())
            sw("Licht an").click()
            pg.get_by_text("Licht an is now inactive.").wait_for(timeout=10000)
            check("deactivating needs no question", pg.get_by_role("dialog").count() == 0)
            check("switching off sends false", posts[-1] == {"id": "1", "active": False} and sw("Licht an").get_attribute("aria-checked") == "false", repr(posts[-1]))

            # a refusal leaves the switch where it was
            st["refuse"] = True
            sw("Licht aus").click()
            pg.get_by_text("could not be switched").wait_for(timeout=10000)
            check("a refusal is told with the reason, the switch stays", "not allowed" in pg.locator("[role=status]").last.inner_text() and sw("Licht aus").get_attribute("aria-checked") == "true")
            st["refuse"] = False

            # a user: yes / no, no switch, still runs programs
            st["profile"] = {"level": "USER"}
            pg.reload(); pg.get_by_role("button", name="Run: Licht an").wait_for()
            row = pg.locator("tbody tr", has=pg.get_by_text("Licht aus", exact=True))
            check("a user sees yes or no and no switch, but can still run a program", pg.get_by_role("switch").count() == 0 and "yes" in row.inner_text().lower() and pg.get_by_role("button", name="Run: Licht an").is_visible())

            # German (back as administrator)
            st["profile"] = None
            pg.reload(); pg.get_by_role("switch", name="Active: Licht an").wait_for()
            pg.get_by_role("button", name="Account menu").click(); pg.get_by_role("menuitemradio", name="Deutsch").click()
            pg.get_by_role("switch", name="Aktiv: Licht an").wait_for()
            pg.get_by_role("switch", name="Aktiv: Licht an").click()
            pg.get_by_role("dialog").get_by_text("Dieses Programm aktivieren?").wait_for()
            pg.get_by_role("dialog").get_by_role("button", name="Aktivieren").click()
            pg.get_by_text("Licht an ist jetzt aktiv.").wait_for(timeout=10000)
            check("German texts", "Aktiv" in pg.locator("thead th").all_inner_texts())

            st["status"] = 401
            pg.get_by_role("switch", name="Aktiv: Licht an").click()   # it is active now: switching off asks nothing
            pg.wait_for_selector("#user", timeout=20000)
            check("an expired session returns to the sign-in form", pg.evaluate("sessionStorage.length") == 0)
            check("no browser errors", not console, "; ".join(console[:3]))
        finally:
            try:
                pg.unroute_all(); pg.reload()
                pg.get_by_role("button", name="Account menu").click(timeout=3000); pg.get_by_role("menuitem", name="Sign out").click(timeout=3000)
            except Exception:
                pass
            browser.close()
    print("%d PASS, %d FAIL" % (sum(results), len(results) - sum(results)))
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
