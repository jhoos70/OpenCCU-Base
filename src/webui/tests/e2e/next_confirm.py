#!/usr/bin/env python3
"""Browser test of confirming alarm and service messages in the nextGen UI.

    python3 next_confirm.py --base http://127.0.0.1:18080 --user Admin --password Admin

The model answers (alarms, services with the canAcknowledge flag) and POST /messages are mocked: the test CCU has no
service messages, and acknowledging is a change that a test must not make on a CCU (the route is proven by the Tcl tests
and against the restored real data). Login, profile and the pages are real. Checks: a Confirm button per message, the reason
instead of a button for a message that cannot be confirmed, one click confirms one message and the lists and the header
counters follow, Confirm all only sends the ones that can be confirmed, a refusal and a message that is gone are told, a
partial failure says how many went through, German. Always signs out.
"""
import argparse, json, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon", "Failed to load resource")
PROFILE = {"userId": "1004", "userName": "Admin", "firstName": "Admin", "hasPassword": True, "isNoExpert": True, "language": "", "level": "ADMIN"}

ALARMS = [
    {"id": "1", "name": "Window open", "occurredAt": "2026-10-30 08:00:00", "canAcknowledge": True},
    {"id": "2", "name": "Fire", "occurredAt": "2026-10-31 19:35:05", "canAcknowledge": True},
    {"id": "3", "name": "Water", "occurredAt": "2026-10-31 20:00:00", "canAcknowledge": False},
]
SERVICES = [
    {"id": "10", "occurredAt": "2026-10-31 07:00:00", "channelName": "Kitchen:0", "message": "Low battery", "isSticky": False, "canAcknowledge": True},
    {"id": "12", "occurredAt": "2026-10-30 12:00:00", "channelName": "Hall:0", "message": "Config pending", "isSticky": False, "canAcknowledge": True},
    {"id": "13", "occurredAt": "2026-10-30 13:00:00", "channelName": "Garage:0", "message": "Communication problem", "isSticky": False, "canAcknowledge": False},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True); ap.add_argument("--user", default="Admin"); ap.add_argument("--password", required=True)
    a = ap.parse_args()
    results, console, posts = [], [], []

    def check(name, ok, detail=""):
        results.append(ok); print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    st = {"alarms": list(ALARMS), "services": list(SERVICES), "answer": {}}
    ok = lambda body: dict(status=200, content_type="application/json", body=json.dumps(body))
    sec = lambda items: {"total": len(items), "offset": 0, "limit": 500, "items": items}

    def on_model(route):
        route.fulfill(**ok({"alarms": sec(st["alarms"]), "services": sec(st["services"])}))

    def on_messages(route):
        if route.request.method != "POST":
            return route.continue_()
        mid = json.loads(route.request.post_data)["id"]
        posts.append(mid)
        if mid in st["answer"]:
            status, code, msg = st["answer"][mid]
            return route.fulfill(status=status, content_type="application/json", body=json.dumps({"error": {"code": code, "message": msg}}))
        st["alarms"] = [x for x in st["alarms"] if x["id"] != mid]
        st["services"] = [x for x in st["services"] if x["id"] != mid]
        route.fulfill(**ok({"id": mid, "acknowledged": True}))

    def counts(pg):
        return (int(pg.locator("a[href='#/alarms']").get_attribute("aria-label").split(":")[1]), int(pg.locator("a[href='#/services']").get_attribute("aria-label").split(":")[1]))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1200, "height": 900})
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and console.append(m.text[:140]))
        pg.on("pageerror", lambda e: console.append("pageerror: " + str(e)[:140]))
        pg.route("**/v2/model?sections=alarms*", on_model)
        pg.route("**/v2/messages", on_messages)
        pg.route("**/v2/profile", lambda r: r.fulfill(**ok(PROFILE)))
        try:
            pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.wait_for_selector("a[href='#/alarms']")
            pg.locator("a[href='#/alarms']").click(); pg.get_by_role("heading", name="Alarm messages").wait_for(); pg.wait_for_selector("tbody tr")

            check("the page says status and control", pg.get_by_text("Status and control").first.is_visible())
            check("a message that can be confirmed has a button, one that cannot has the reason instead", pg.get_by_role("button", name="Confirm: Fire").is_visible() and pg.get_by_role("button", name="Confirm: Water").count() == 0 and pg.get_by_text("cannot be confirmed here").count() == 1)
            check("the header says 3 alarms", counts(pg)[0] == 3)

            pg.get_by_role("button", name="Confirm: Fire").click()
            pg.get_by_text("Confirmed.").wait_for(timeout=10000)
            check("one click confirms one message", posts == ["2"], repr(posts))
            pg.wait_for_function("document.querySelector(\"a[href='#/alarms']\").getAttribute('aria-label').endsWith(': 2')", timeout=10000)
            check("the list and the header counter follow at once", counts(pg)[0] == 2 and pg.get_by_role("cell", name="Fire", exact=True).count() == 0)

            # a refusal and a message that is gone
            st["answer"]["1"] = (403, 400, "access denied (message)")
            pg.get_by_role("button", name="Confirm: Window open").click()
            pg.get_by_role("alert").filter(has_text="not allowed").wait_for(timeout=10000)
            check("a refusal is told", True)
            st["answer"]["1"] = (404, 501, "message not found")
            pg.get_by_role("button", name="Confirm: Window open").click()
            pg.get_by_role("alert").filter(has_text="does not exist any more").wait_for(timeout=10000)
            check("a message somebody else confirmed is told as gone", True)
            del st["answer"]["1"]

            # confirm all: only the ones that can be
            del posts[:]
            st["alarms"] = list(ALARMS)
            pg.get_by_role("button", name="Refresh").click() if pg.get_by_role("button", name="Refresh").count() else pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
            pg.get_by_role("button", name="Confirm all").wait_for()
            pg.wait_for_function("document.querySelectorAll('tbody tr').length === 3", timeout=10000)
            pg.get_by_role("button", name="Confirm all").click()
            pg.get_by_text("2 confirmed.").wait_for(timeout=10000)
            check("Confirm all sends only the messages that can be confirmed", sorted(posts) == ["1", "2"], repr(posts))
            check("what cannot be confirmed stays", pg.get_by_role("cell", name="Water", exact=True).count() == 1)

            # services
            pg.locator("a[href='#/services']").click(); pg.get_by_role("heading", name="Service messages").wait_for(); pg.wait_for_selector("tbody tr")
            check("service messages have the same buttons and reason", pg.get_by_role("button", name="Confirm: Kitchen:0: Low battery").is_visible() and pg.get_by_text("cannot be confirmed here").count() == 1)
            del posts[:]
            st["answer"]["12"] = (403, 400, "access denied (message)")
            pg.get_by_role("button", name="Confirm all").click()
            pg.get_by_role("alert").filter(has_text="1 of 2 confirmed").wait_for(timeout=10000)
            check("a partial failure says how many went through", sorted(posts) == ["10", "12"], repr(posts))

            # German
            pg.get_by_role("button", name="Account menu").click(); pg.get_by_role("menuitemradio", name="Deutsch").click()
            pg.get_by_role("button", name="Alle bestätigen").wait_for()
            check("German texts", pg.get_by_text("kann hier nicht bestätigt werden").count() >= 1)
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
