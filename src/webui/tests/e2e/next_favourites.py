#!/usr/bin/env python3
"""Browser test of the Favourites page of the nextGen UI.

    python3 next_favourites.py --base http://127.0.0.1:18080 --user Admin --password Admin

The test CCU has no device and no favourite list, so /favourites, the values of the channels, the system variables and
the answers to a command are mocked (the routes are proven by the Tcl tests and against restored real data); login,
profile and the page are real. Checks: the lists as buttons, the members in list order, what a channel shows at first
sight and under "more values", a separator, a system variable with its change dialog, a channel without values, a
command (yes/no) and a refused one, the empty states, a user, German and an expired session. Nothing on the CCU is
changed. Always signs out.
"""
import argparse, json, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon", "Failed to load resource")
PROFILE = {"userId": "1004", "userName": "Admin", "firstName": "Admin", "hasPassword": True, "isNoExpert": True, "language": "", "level": "ADMIN"}


def item(id, type, name):
    return {"id": id, "type": type, "name": name}


LISTS = [
    {"id": "10", "name": "Heizung", "info": "", "items": [item("101", "CHANNEL", "Wohnzimmer Gruppe:1"), item("0", "SEPARATOR", ""), item("950", "SYSVAR", "Anwesenheit"), item("103", "CHANNEL", "Weg:1")]},
    {"id": "11", "name": "Licht", "info": "", "items": [item("201", "CHANNEL", "Lampe:1"), item("300", "PROGRAM", "Abendlicht")]},
    {"id": "12", "name": "Leer", "info": "", "items": []},
]


def dp(id, channel, param, type, value, **kw):
    d = {"id": id, "name": "x." + param, "channelId": channel, "channel": "c", "param": param, "type": type, "value": value, "unit": "", "min": "", "max": "", "valueList": "",
         "timestamp": "2026-11-01 10:00:00", "integer": False, "readable": True, "writable": True}
    d.update(kw)
    return d


VALUES = [
    dp("1", "101", "RSSI_PEER", "NUMBER", "-70", integer=True, writable=False),
    dp("2", "101", "ACTUAL_TEMPERATURE", "NUMBER", "19.5", unit="°C", writable=False),
    dp("3", "101", "SET_TEMPERATURE", "NUMBER", "21.0", unit="°C", min="4.5", max="30.5"),
    dp("4", "101", "LOWBAT", "LOGIC", "false", writable=False),
    dp("5", "201", "STATE", "LOGIC", "true"),
]
SYSVAR = {"id": "950", "name": "Anwesenheit", "type": "LOGIC", "unit": "", "value": "true", "valueName0": "abwesend", "valueName1": "anwesend", "description": "", "lastModified": "2026-11-01 09:00:00", "isVisible": True, "isInternal": False}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True); ap.add_argument("--user", default="Admin"); ap.add_argument("--password", required=True)
    a = ap.parse_args()
    results, console, posts, urls = [], [], [], []

    def check(name, ok, detail=""):
        results.append(ok); print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    st = {"lists": LISTS, "profile": None, "post": None, "favs_status": 200}
    ok = lambda body: dict(status=200, content_type="application/json", body=json.dumps(body))

    def on_favs(route):
        if st["favs_status"] != 200:
            return route.fulfill(status=st["favs_status"], content_type="application/json", body=json.dumps({"error": {"code": 400, "message": "x"}}))
        route.fulfill(**ok({"lists": st["lists"]}))

    def on_values(route):
        req = route.request
        if req.method == "POST":
            posts.append(("values", json.loads(req.post_data)))
            status, body = st["post"]
            return route.fulfill(status=status, content_type="application/json", body=json.dumps(body))
        urls.append(req.url)
        route.fulfill(**ok({"channels": "", "items": VALUES}))

    def on_sysvars_post(route):
        if route.request.method != "POST":
            return route.continue_()
        posts.append(("sysvars", json.loads(route.request.post_data)))
        route.fulfill(**ok({"id": "950", "value": "false", "lastModified": "2026-11-01 10:05:00"}))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1280, "height": 1000})
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and console.append(m.text[:140]))
        pg.route("**/v2/favourites", on_favs)
        pg.route("**/v2/values*", on_values)
        pg.route("**/v2/sysvars", on_sysvars_post)
        pg.route("**/v2/model?sections=sysvars*", lambda r: r.fulfill(**ok({"sysvars": {"total": 1, "offset": 0, "limit": 500, "items": [SYSVAR]}})))
        pg.route("**/v2/profile", lambda r: r.fulfill(**ok({**PROFILE, **(st["profile"] or {})})))
        try:
            pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.get_by_role("link", name="Favourites", exact=True).first.click()
            pg.get_by_role("button", name="Open the list Heizung").wait_for()
            pg.get_by_role("heading", name="Wohnzimmer Gruppe:1").wait_for()
            check("the lists are buttons, the first is open", pg.locator("[role=group] button").all_inner_texts() == ["Heizung", "Licht", "Leer"] and pg.get_by_role("button", name="Open the list Heizung").get_attribute("aria-pressed") == "true")
            check("the members come in list order", [h for h in pg.locator("section h3").all_inner_texts()] == ["Wohnzimmer Gruppe:1", "Anwesenheit", "Weg:1"], repr(pg.locator("section h3").all_inner_texts()))
            check("one request reads the channels of the list", len(urls) >= 1 and "channels=101,103" in urls[0], urls[0].split("v2/")[-1])
            block = pg.locator("section", has=pg.get_by_role("heading", name="Wohnzimmer Gruppe:1"))
            params = block.locator("tbody > tr > td:first-child").all_inner_texts()
            check("the usual parameters come first, in order", [x for x in params if x.strip() and x.strip().isupper()][:2] == ["SET_TEMPERATURE", "ACTUAL_TEMPERATURE"], repr(params[:3]))
            check("the rest is under more values", block.get_by_text("More values (2)").is_visible() and not block.get_by_text("RSSI_PEER").is_visible())
            block.get_by_text("More values (2)").click()
            check("more values opens and shows them", block.get_by_text("RSSI_PEER").is_visible())
            check("a separator is a line", pg.locator("hr").count() == 1)
            check("a channel without values says so", pg.get_by_text("No values: this channel is not available.").count() == 1)

            # a command from the page
            st["post"] = (200, VALUES[2])
            pg.get_by_role("button", name="Change SET_TEMPERATURE").click()
            pg.get_by_label("SET_TEMPERATURE", exact=True).fill("22")
            pg.get_by_role("button", name="OK").click()
            pg.get_by_text("SET_TEMPERATURE: command sent").wait_for()
            check("a command from a favourite is sent as typed", posts[-1] == ("values", {"id": "3", "value": "22"}), repr(posts[-1]))
            st["post"] = (502, {"error": {"code": 501, "message": "x"}})
            pg.get_by_role("button", name="Change SET_TEMPERATURE").click()
            pg.get_by_label("SET_TEMPERATURE", exact=True).fill("23")
            pg.get_by_role("button", name="OK").click()
            pg.get_by_role("alert").filter(has_text="did not pass the command on").wait_for()
            check("a refused command is an error, not sent", pg.get_by_role("alert").filter(has_text="did not pass the command on").is_visible() and pg.get_by_text("SET_TEMPERATURE: command sent").count() == 0)
            pg.get_by_role("button", name="Cancel").click()

            # the system variable
            check("a system variable shows its value name", pg.locator("section", has=pg.get_by_role("heading", name="Anwesenheit")).inner_text().count("anwesend") >= 1)
            pg.get_by_role("button", name="Change: Anwesenheit").click()
            pg.get_by_role("dialog").wait_for()
            pg.get_by_role("dialog").locator("select").select_option("false")
            pg.get_by_role("button", name="OK").click()
            pg.get_by_role("dialog").wait_for(state="hidden")
            check("a system variable is changed with the same dialog", posts[-1] == ("sysvars", {"id": "950", "value": False}), repr(posts[-1]))

            # the other lists
            pg.get_by_role("button", name="Open the list Licht").click()
            pg.get_by_role("heading", name="Lampe:1").wait_for()
            check("another list opens", pg.get_by_role("button", name="Set STATE to no").is_visible())
            check("a program is named, not run", pg.get_by_text("Program (run it on the Programs page)").is_visible())
            pg.get_by_role("button", name="Open the list Leer").click()
            check("an empty list says so", pg.get_by_text("This list is empty.").is_visible())

            # empty and user and German and expired
            st["lists"] = []
            pg.get_by_role("button", name="Refresh").click()
            pg.get_by_text("You have no favourite lists").wait_for()
            check("no lists: says where they are made", "classic UI" in pg.get_by_text("You have no favourite lists").inner_text())
            st["lists"] = LISTS
            pg.reload(); pg.get_by_role("button", name="Open the list Heizung").wait_for()
            pg.get_by_role("button", name="Account menu").click(); pg.get_by_role("menuitemradio", name="Deutsch").click()
            pg.get_by_role("button", name="Liste Heizung öffnen").wait_for()
            check("German texts", pg.get_by_text("Weitere Werte (2)").first.is_visible())
            pg.get_by_role("link", name="Übersicht", exact=True).click()
            check("the overview links to the favourites", pg.locator("a[href='#/favourites']").count() >= 1)
            st["favs_status"] = 401
            pg.get_by_role("link", name="Favoriten", exact=True).first.click()
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
