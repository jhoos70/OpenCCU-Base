#!/usr/bin/env python3
"""Browser test of the Favourites tiles of the nextGen UI.

    python3 next_favourites.py --base http://127.0.0.1:18080 --user Admin --password Admin

The test CCU has no device and no favourite list, so /favourites, the device model, the values of the channels, the
system variables and the answers to a command are mocked (the routes are proven by the Tcl tests and against restored
real data); login, profile and the page are real. The mocked "device" confirms a command a moment after it was sent, as
a real one does; one command is never confirmed, to see the 30 s rule (the browser clock is fast-forwarded).
Checks: lists, tiles by channel type (heating, shutter, socket with its meter, weather, other, variable), titles without
technical suffixes, hidden week profiles, taps collected into one command, the sending / confirmed / no-confirmation /
refused states, unreachable and low battery, the generic fallback, German and an expired session. Nothing on the CCU
is changed. Always signs out.
"""
import argparse, json, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon", "Failed to load resource")
PROFILE = {"userId": "1004", "userName": "Admin", "firstName": "Admin", "hasPassword": True, "isNoExpert": True, "language": "", "level": "ADMIN"}


def chan(id, dev, index, name, ctype):
    return {"id": id, "name": name, "address": "%s:%d" % (dev["address"], index), "deviceId": dev["id"], "index": index, "partnerId": "", "mode": "MODE_DEFAULT", "category": "CATEGORY_NONE", "isReady": True, "isUsable": True,
            "isVisible": True, "isLogged": False, "isEventable": True, "isReadable": True, "isWritable": True, "isVirtual": False, "isAesAvailable": False, "channelType": ctype}


def device(id, name, address, type, channels):
    d = {"id": id, "name": name, "address": address, "interface": "BidCos-RF", "type": type, "operateGroupOnly": "false", "isReady": True, "channels": []}
    d["channels"] = [chan(cid, d, i, n, ct) for cid, i, n, ct in channels]
    return d


DEVICES = [
    device("10", "Wohnzimmer Gruppe", "INT1", "HM-CC-VG-1", [("101", 1, "Wohnzimmer Gruppe:1", "CLIMATECONTROL_RT_TRANSCEIVER")]),
    device("11", "Bad", "HM6", "HmIP-HEATING", [("102", 1, "Bad:1", "HEATING_CLIMATECONTROL_TRANSCEIVER")]),
    device("20", "Steckdose Server", "SOCK1", "HMIP-PSM", [("201", 2, "Steckdose Server:2", "SWITCH_TRANSMITTER"), ("202", 3, "Steckdose Server:3", "SWITCH_VIRTUAL_RECEIVER"), ("203", 6, "Steckdose Server:6", "ENERGIE_METER_TRANSMITTER")]),
    device("30", "Rollladen Küche", "SH1", "HmIP-BROLL", [("301", 4, "Rollladen Küche:4", "SHUTTER_VIRTUAL_RECEIVER"), ("302", 5, "Rollladen Küche:5", "BLIND_WEEK_PROFILE")]),
    device("40", "Aussensensor", "W1", "HM-WDS", [("401", 1, "Aussensensor:1", "WEATHER")]),
    device("50", "Taster Flur", "K1", "HM-RC-4", [("501", 1, "Taster Flur:1", "KEY")]),
    device("60", "Analog", "AN1", "HM-X", [("601", 1, "Analog:1", "ANALOG_OUTPUT")]),
]


def item(id, type, name):
    return {"id": id, "type": type, "name": name}


LISTS = [
    {"id": "1", "name": "Heizung", "info": "", "items": [item("101", "CHANNEL", "Wohnzimmer Gruppe:1"), item("0", "SEPARATOR", ""), item("950", "SYSVAR", "Anwesenheit"), item("102", "CHANNEL", "Bad:1")]},
    {"id": "2", "name": "Strom", "info": "", "items": [item("201", "CHANNEL", "Steckdose Server:2"), item("202", "CHANNEL", "Steckdose Server:3"), item("203", "CHANNEL", "Steckdose Server:6"), item("401", "CHANNEL", "Aussensensor:1")]},
    {"id": "3", "name": "Rollo", "info": "", "items": [item("301", "CHANNEL", "Rollladen Küche:4"), item("302", "CHANNEL", "Rollladen Küche:5"), item("501", "CHANNEL", "Taster Flur:1"), item("601", "CHANNEL", "Analog:1"), item("300", "PROGRAM", "Abendlicht")]},
    {"id": "4", "name": "Leer", "info": "", "items": []},
]


def dp(id, ch, param, type, value, **kw):
    cid, addr, idx, cname = ch
    d = {"id": id, "name": "BidCos-RF.%s:%d.%s" % (addr, idx, param), "channelId": cid, "channel": cname, "param": param, "type": type, "value": value, "unit": "", "min": "", "max": "", "valueList": "",
         "timestamp": "2026-11-01 10:00:00", "integer": False, "readable": True, "writable": False}
    d.update(kw)
    return d


def values():
    g, bad, sock, sh, w, k = ("101", "INT1", 1, "Wohnzimmer Gruppe:1"), ("102", "HM6", 1, "Bad:1"), ("202", "SOCK1", 3, "Steckdose Server:3"), ("301", "SH1", 4, "Rollladen Küche:4"), ("401", "W1", 1, "Aussensensor:1"), ("501", "K1", 1, "Taster Flur:1")
    fb, met = ("201", "SOCK1", 2, "Steckdose Server:2"), ("203", "SOCK1", 6, "Steckdose Server:6")
    return [
        dp("1", g, "SET_TEMPERATURE", "NUMBER", "21.000000", unit="°C", min="5.0", max="30.0", writable=True),
        dp("2", g, "ACTUAL_TEMPERATURE", "NUMBER", "19.500000", unit="°C"),
        dp("3", g, "ACTUAL_HUMIDITY", "NUMBER", "48", unit="%"),
        dp("4", g, "CONTROL_MODE", "LIST", "0", valueList="AUTO-MODE;MANU-MODE;PARTY-MODE;BOOST-MODE"),
        dp("5", g, "AUTO_MODE", "ACTION", "", writable=True),
        dp("6", g, "MANU_MODE", "NUMBER", "", unit="°C", min="4.5", max="30.5", writable=True),
        dp("7", g, "BOOST_MODE", "ACTION", "", writable=True),
        dp("11", bad, "SET_POINT_TEMPERATURE", "NUMBER", "20.500000", unit="°C", min="4.500000", max="30.500000", writable=True),
        dp("12", bad, "ACTUAL_TEMPERATURE", "NUMBER", "20.100000", unit="°C"),
        dp("13", bad, "SET_POINT_MODE", "NUMBER", "0", writable=True, integer=True),
        dp("14", bad, "BOOST_MODE", "LOGIC", "false", writable=True),
        dp("15", ("199", "HM6", 0, "Bad:0"), "UNREACH", "LOGIC", "true"),
        dp("16", ("199", "HM6", 0, "Bad:0"), "LOWBAT", "LOGIC", "true"),
        dp("21", fb, "STATE", "LOGIC", "true"),
        dp("22", sock, "STATE", "LOGIC", "true", writable=True),
        dp("23", met, "POWER", "NUMBER", "120.000000", unit="W"),
        dp("24", met, "ENERGY_COUNTER", "NUMBER", "3400.000000", unit="Wh"),
        dp("31", sh, "LEVEL", "NUMBER", "0.400000", min="0.000000", max="1.010000", writable=True),
        dp("32", sh, "STOP", "ACTION", "", writable=True),
        dp("41", w, "TEMPERATURE", "NUMBER", "8.500000", unit="°C"),
        dp("42", w, "HUMIDITY", "NUMBER", "71", unit="%"),
        dp("51", k, "PRESS_SHORT", "ACTION", "", writable=True),
        dp("52", k, "PRESS_LONG", "ACTION", "", writable=True),
        dp("61", ("601", "AN1", 1, "Analog:1"), "OUTPUT_X", "NUMBER", "3", writable=True),
    ]


SYSVAR = {"id": "950", "name": "Anwesenheit", "type": "LOGIC", "unit": "", "value": "true", "valueName0": "abwesend", "valueName1": "anwesend", "description": "", "lastModified": "2026-11-01 09:00:00", "isVisible": True, "isInternal": False}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True); ap.add_argument("--user", default="Admin"); ap.add_argument("--password", required=True); ap.add_argument("--shots", default="")
    a = ap.parse_args()
    results, console, posts = [], [], []

    def check(name, ok, detail=""):
        results.append(ok); print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    st = {"lists": LISTS, "vals": values(), "post": None, "favs_status": 200, "device_confirms": True}
    ok = lambda body: dict(status=200, content_type="application/json", body=json.dumps(body))

    def on_favs(route):
        req = route.request
        if st["favs_status"] != 200:
            return route.fulfill(status=st["favs_status"], content_type="application/json", body=json.dumps({"error": {"code": 400, "message": "x"}}))
        if req.method == "POST":
            body = json.loads(req.post_data)
            posts.append(("favs_post", body))
            lid = body.get("id") or "99"
            name_map = {
                ("CHANNEL", "101"): "Wohnzimmer Gruppe:1",
                ("CHANNEL", "102"): "Bad:1",
                ("CHANNEL", "202"): "Steckdose Server:3",
                ("SYSVAR", "950"): "Anwesenheit",
                ("PROGRAM", "300"): "Abendlicht",
            }
            items = []
            for idx, it in enumerate(body.get("items", [])):
                if it["type"] == "SEPARATOR":
                    items.append({"id": str(900 + idx), "type": "SEPARATOR", "name": ""})
                else:
                    items.append({"id": it["id"], "type": it["type"], "name": name_map.get((it["type"], it["id"]), it["id"])})
            saved = {"id": lid, "name": body["name"], "info": body.get("info", ""), "items": items}
            if body.get("id"):
                st["lists"] = [saved if x["id"] == lid else x for x in st["lists"]]
            else:
                st["lists"] = st["lists"] + [saved]
            return route.fulfill(**ok(saved))
        if req.method == "DELETE":
            lid = req.url.split("id=")[-1]
            posts.append(("favs_delete", lid))
            st["lists"] = [x for x in st["lists"] if x["id"] != lid]
            return route.fulfill(**ok({"id": lid, "deleted": True}))
        route.fulfill(**ok({"lists": st["lists"]}))

    def on_values(route):
        req = route.request
        if req.method == "POST":
            body = json.loads(req.post_data)
            posts.append(("values", body))
            if st["post"] is not None:
                status, resp = st["post"]
                return route.fulfill(status=status, content_type="application/json", body=json.dumps(resp))
            d = next(x for x in st["vals"] if x["id"] == body["id"])
            if st["device_confirms"] and d["type"] in ("NUMBER", "LOGIC", "LIST"):
                d["value"] = ("%f" % float(body["value"])) if d["type"] == "NUMBER" else (str(body["value"]).lower() if d["type"] == "LOGIC" else str(body["value"]))
            if st["device_confirms"] and body["id"] == "22":  # an HmIP socket: the feedback channel follows the control channel
                next(x for x in st["vals"] if x["id"] == "21")["value"] = d["value"]
            return route.fulfill(**ok(d))
        route.fulfill(**ok({"channels": "", "items": st["vals"]}))

    def on_sysvars_post(route):
        if route.request.method != "POST":
            return route.continue_()
        posts.append(("sysvars", json.loads(route.request.post_data)))
        route.fulfill(**ok({"id": "950", "value": "false", "lastModified": "2026-11-01 10:05:00"}))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1280, "height": 1000})
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and console.append(m.text[:140]))
        pg.on("pageerror", lambda e: console.append("pageerror: " + str(e)[:140]))
        pg.route("**/v2/favourites*", on_favs)
        pg.route("**/v2/values*", on_values)
        pg.route("**/v2/sysvars", on_sysvars_post)
        pg.route("**/v2/model?sections=devices*", lambda r: r.fulfill(**ok({"devices": {"total": len(DEVICES), "offset": 0, "limit": 500, "items": DEVICES}})))
        pg.route("**/v2/model?sections=sysvars*", lambda r: r.fulfill(**ok({"sysvars": {"total": 1, "offset": 0, "limit": 500, "items": [SYSVAR]}})))
        pg.route("**/v2/model?sections=programs*", lambda r: r.fulfill(**ok({"programs": {"total": 1, "offset": 0, "limit": 500, "items": [{"id": "300", "name": "Abendlicht", "description": "", "lastExecuteTime": "", "isActive": True, "isInternal": False, "isOperable": True, "isCopy": False}]}})))
        pg.route("**/v2/profile", lambda r: r.fulfill(**ok(PROFILE)))
        tile = lambda title: pg.locator("article", has=pg.get_by_role("heading", name=title, exact=True))
        try:
            pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.get_by_role("link", name="Favourites", exact=True).first.click()
            pg.get_by_role("heading", name="Wohnzimmer").wait_for()

            def shot(name):
                if a.shots:
                    pg.screenshot(path="%s/tiles-%s.png" % (a.shots, name), clip={"x": 0, "y": 60, "width": 1280, "height": 900})

            # ---- heating
            shot("heizung")
            check("the lists are buttons, the first is open", pg.locator("[role=group] button").all_inner_texts()[:4] == ["Heizung", "Strom", "Rollo", "Leer"] and pg.get_by_role("button", name="Open the list Heizung").get_attribute("aria-pressed") == "true")
            check("tiles in list order; the titles lose the suffix and the word Gruppe", pg.locator("article h3").all_inner_texts() == ["Wohnzimmer", "Anwesenheit", "Bad"], repr(pg.locator("article h3").all_inner_texts()))
            check("a separator is a line", pg.locator("hr").count() == 1)
            heat = tile("Wohnzimmer")
            txt = heat.inner_text()
            check("heating shows the target big, the actual value and the humidity", "21,0" in txt.replace(".", ",") and "19" in txt and "48 % humidity" in txt, repr(txt[:120]))
            check("the current mode is pressed", heat.get_by_role("button", name="Auto").get_attribute("aria-pressed") == "true" and heat.get_by_role("button", name="Manual").get_attribute("aria-pressed") == "false")
            check("an unreachable device is marked, with a low battery, and cannot be operated", tile("Bad").get_by_text("Unreachable").is_visible() and tile("Bad").get_by_text("Battery low").is_visible() and tile("Bad").get_by_role("button", name="Raise the target temperature").is_disabled())

            # two taps are one command, sent after a pause; the device confirms a moment later
            before = len(posts)
            heat.get_by_role("button", name="Raise the target temperature").click(); heat.get_by_role("button", name="Raise the target temperature").click()
            check("taps send nothing at once", len(posts) == before)
            for _ in range(60):  # the debounce is 1.2 s; the mocked device confirms at once, so "sending" is too short to catch
                if len(posts) > before:
                    break
                pg.wait_for_timeout(100)
            check("two taps are one command with the final target", len(posts) == before + 1 and posts[-1] == ("values", {"id": "1", "value": "22.0"}), repr(posts[-1]))
            heat.get_by_text("Target 22,0 °C confirmed", exact=False).or_(heat.get_by_text("Target 22.0 °C confirmed", exact=False)).wait_for(timeout=15000)
            check("the device's confirmation ends the waiting", True)

            # a mode
            heat.get_by_role("button", name="Boost").click()
            heat.get_by_text("Boost sent").wait_for(timeout=5000)
            check("boost (a button of the device) is sent, not confirmed", posts[-1] == ("values", {"id": "7", "value": True}), repr(posts[-1]))
            heat.get_by_role("button", name="Manual").click()
            heat.get_by_text("Manual", exact=False).first.wait_for()
            check("manual keeps the target temperature", posts[-1] == ("values", {"id": "6", "value": "22"}), repr(posts[-1]))

            # a command nothing confirms: 30 s, then a retry
            st["device_confirms"] = False
            pg.clock.install()
            heat.get_by_role("button", name="Lower the target temperature").click()
            pg.clock.run_for(1500)
            heat.get_by_text("Sending… waiting for the device").wait_for(timeout=5000)
            pg.clock.run_for(32000)
            heat.get_by_text("No confirmation from the device (30 s).").wait_for(timeout=10000)
            check("no confirmation after 30 s says so and offers a retry", heat.get_by_role("button", name="Try again").is_visible())
            n = len(posts)
            heat.get_by_role("button", name="Try again").click()
            heat.get_by_text("Sending… waiting for the device").wait_for(timeout=5000)
            check("a retry sends the same command again", len(posts) == n + 1 and posts[-1] == posts[-2], repr(posts[-2:]))
            pg.reload(); pg.get_by_role("heading", name="Wohnzimmer").wait_for()
            st["device_confirms"] = True
            heat = tile("Wohnzimmer")

            # a refused command
            st["post"] = (502, {"error": {"code": 501, "message": "x"}})
            heat.get_by_role("button", name="Raise the target temperature").click()
            heat.get_by_role("alert").filter(has_text="did not pass the command on").wait_for(timeout=8000)
            check("a refused command is an error on the tile, with a retry", heat.get_by_role("button", name="Try again").is_visible())
            st["post"] = None

            # the variable
            check("a variable shows its value name", "anwesend" in tile("Anwesenheit").inner_text())
            tile("Anwesenheit").get_by_role("switch").click()
            tile("Anwesenheit").get_by_text("confirmed", exact=False).wait_for(timeout=5000)
            check("a logic variable is switched like a switch", posts[-1] == ("sysvars", {"id": "950", "value": False}), repr(posts[-1]))

            # ---- sockets and weather
            pg.get_by_role("button", name="Open the list Strom").click()
            pg.get_by_role("heading", name="Steckdose Server", exact=True).wait_for()
            check("a socket, its feedback and its meter are one tile; the weather sensor another", pg.locator("article h3").all_inner_texts() == ["Steckdose Server", "Aussensensor"], repr(pg.locator("article h3").all_inner_texts()))
            shot("strom")
            sock = tile("Steckdose Server")
            check("the socket shows its state and its power", sock.get_by_role("switch").get_attribute("aria-checked") == "true" and "120 W now" in sock.inner_text())
            sock.get_by_role("switch").click()
            sock.get_by_text("confirmed", exact=False).wait_for(timeout=15000)
            check("the switch operates the control channel with a boolean", posts[-1] == ("values", {"id": "22", "value": False}), repr(posts[-1]))
            check("a weather tile is read only", tile("Aussensensor").locator("button").count() == 0 and "8" in tile("Aussensensor").inner_text())

            # ---- shutter, other, program, hidden
            pg.get_by_role("button", name="Open the list Rollo").click()
            pg.get_by_role("heading", name="Rollladen Küche", exact=True).wait_for()
            shot("rollo")
            sh = tile("Rollladen Küche")
            check("a shutter shows percent open", "40" in sh.inner_text() and "% open" in sh.inner_text())
            st["device_confirms"] = True
            sh.get_by_role("button", name="Open").click()
            sh.get_by_text("confirmed", exact=False).wait_for(timeout=15000)
            check("open sends level 1", posts[-1] == ("values", {"id": "31", "value": "1"}), repr(posts[-1]))
            sh.get_by_role("button", name="Stop").click()
            sh.get_by_text("Stop sent").wait_for(timeout=5000)
            check("stop is a button of the device", posts[-1] == ("values", {"id": "32", "value": True}), repr(posts[-1]))
            check("the week profile is not a tile, and the page says so", pg.get_by_text("Not shown: 1").is_visible() and pg.locator("article h3").all_inner_texts() == ["Rollladen Küche", "Taster Flur", "Analog", "Abendlicht"], repr(pg.locator("article h3").all_inner_texts()))
            tile("Taster Flur").get_by_role("button", name="Short press").click()
            tile("Taster Flur").get_by_text("Short press sent").wait_for(timeout=5000)
            check("a button tile presses the key: sent, nothing to confirm", posts[-1] == ("values", {"id": "51", "value": True}), repr(posts[-1]))
            tile("Analog").get_by_role("button", name="Show values").click()
            check("anything else keeps its values as a table", tile("Analog").get_by_text("OUTPUT_X", exact=True).is_visible())
            check("a program is named, not run", pg.get_by_text("Program (run it on the Programs page)").is_visible())
            pg.get_by_role("button", name="Open the list Leer").click()
            check("an empty list says so", pg.get_by_text("This list is empty.").is_visible())

            # ---- empty, create, edit, delete, German, expired
            st["lists"] = []
            pg.get_by_role("button", name="Refresh").click()
            pg.get_by_text("You have no favourite lists").wait_for()
            check("no lists: offers New list button", pg.get_by_role("button", name="New list").is_visible())

            # create a new list from empty state
            pg.get_by_role("button", name="New list").click()
            dlg = pg.get_by_role("dialog")
            dlg.get_by_label("Name", exact=True).fill("Abend")
            dlg.get_by_label("Description", exact=True).fill("Abendroutine")
            dlg.get_by_role("button", name="Add Wohnzimmer Gruppe:1").click()
            dlg.get_by_role("button", name="Add separator").click()
            dlg.get_by_role("group", name="Add to list").get_by_role("button", name="System variables").click()
            dlg.get_by_role("button", name="Add Anwesenheit").click()
            dlg.get_by_role("button", name="OK").click()
            pg.get_by_role("button", name="Open the list Abend").wait_for()
            check("creating a list sends POST /favourites and opens the created list", posts[-1] == ("favs_post", {"name": "Abend", "info": "Abendroutine", "items": [{"type": "CHANNEL", "id": "101"}, {"type": "SEPARATOR"}, {"type": "SYSVAR", "id": "950"}]}) and pg.get_by_text("Abendroutine").is_visible(), repr(posts[-1]))

            # edit the list: reorder, remove separator, add program
            pg.get_by_role("button", name="Edit list").click()
            dlg = pg.get_by_role("dialog")
            dlg.get_by_label("Name", exact=True).fill("Abend 2")
            dlg.get_by_role("button", name="Remove Separator").click()
            dlg.get_by_role("button", name="Move Anwesenheit up").click()
            dlg.get_by_role("group", name="Add to list").get_by_role("button", name="Programs").click()
            dlg.get_by_role("button", name="Add Abendlicht").click()
            dlg.get_by_role("button", name="OK").click()
            pg.get_by_role("button", name="Open the list Abend 2").wait_for()
            check("editing a list sends id and reordered items", posts[-1] == ("favs_post", {"id": "99", "name": "Abend 2", "info": "Abendroutine", "items": [{"type": "SYSVAR", "id": "950"}, {"type": "CHANNEL", "id": "101"}, {"type": "PROGRAM", "id": "300"}]}), repr(posts[-1]))

            # delete the list: Cancel is focused first, then confirm Delete
            pg.get_by_role("button", name="Delete list").click()
            cdlg = pg.get_by_role("dialog")
            check("delete dialog focuses Cancel first", cdlg.get_by_role("button", name="Cancel").evaluate("el => el === document.activeElement"))
            cdlg.get_by_role("button", name="Cancel").click()
            check("cancelling delete keeps the list", pg.get_by_role("button", name="Open the list Abend 2").is_visible())
            pg.get_by_role("button", name="Delete list").click()
            pg.get_by_role("dialog").get_by_role("button", name="Delete").click()
            pg.get_by_text("You have no favourite lists").wait_for()
            check("confirming delete sends DELETE /favourites?id=99", posts[-1] == ("favs_delete", "99"), repr(posts[-1]))

            st["lists"] = LISTS
            pg.reload(); pg.get_by_role("button", name="Open the list Heizung").wait_for()
            pg.get_by_role("button", name="Account menu").click(); pg.get_by_role("menuitemradio", name="Deutsch").click()
            pg.get_by_role("button", name="Liste Heizung öffnen").wait_for()
            pg.get_by_role("heading", name="Wohnzimmer").wait_for()
            check("German texts", pg.get_by_text("Heizung", exact=True).first.is_visible() and tile("Wohnzimmer").get_by_role("button", name="Manuell").is_visible())
            pg.get_by_role("link", name="Übersicht", exact=True).click()
            check("the overview links to the favourites", pg.locator("a[href='#/favourites']").count() >= 1)
            st["favs_status"] = 401
            pg.get_by_role("link", name="Favoriten", exact=True).first.click()
            pg.wait_for_selector("#user", timeout=20000)
            check("an expired session returns to the sign-in form", pg.evaluate("sessionStorage.length") == 0)

            # ---- real ReGa round-trip (unmocked /favourites on the test CCU)
            pg.unroute_all()
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.get_by_role("link", name="Favoriten", exact=True).first.wait_for(timeout=20000)
            sid = pg.evaluate("JSON.parse(sessionStorage.getItem('openccu.next.session')).sid")
            real_id = None
            try:
                res = pg.evaluate("""async (sid) => {
                  const h = {'X-Requested-With': 'XMLHttpRequest', 'X-Session-Id': sid, 'Content-Type': 'application/json'};
                  const r1 = await fetch('/api/homematic.cgi/v2/favourites', {
                    method: 'POST', headers: h,
                    body: JSON.stringify({name: 'ZZTestFav', info: 'Real ReGa', items: [{type: 'SEPARATOR'}, {type: 'SYSVAR', id: '950'}]})
                  });
                  const created = await r1.json();
                  const r2 = await fetch('/api/homematic.cgi/v2/favourites', {headers: {'X-Requested-With': 'XMLHttpRequest', 'X-Session-Id': sid}});
                  const listed = await r2.json();
                  const r3 = await fetch('/api/homematic.cgi/v2/favourites', {
                    method: 'POST', headers: h,
                    body: JSON.stringify({id: created.id, name: 'ZZTestFav2', info: 'Updated', items: [{type: 'SYSVAR', id: '950'}]})
                  });
                  const updated = await r3.json();
                  const r4 = await fetch('/api/homematic.cgi/v2/favourites', {
                    method: 'POST', headers: h,
                    body: JSON.stringify({id: created.id, name: 'ZZTestFav2', items: [{type: 'CHANNEL', id: '999999'}]})
                  });
                  const r5 = await fetch('/api/homematic.cgi/v2/favourites?id=' + encodeURIComponent(created.id), {
                    method: 'DELETE', headers: {'X-Requested-With': 'XMLHttpRequest', 'X-Session-Id': sid}
                  });
                  const deleted = await r5.json();
                  const r6 = await fetch('/api/homematic.cgi/v2/favourites', {headers: {'X-Requested-With': 'XMLHttpRequest', 'X-Session-Id': sid}});
                  const after = await r6.json();
                  return {s1: r1.status, created, listed, s3: r3.status, updated, s4: r4.status, s5: r5.status, deleted, after};
                }""", sid)
                real_id = res.get("created", {}).get("id")
                check("real ReGa: POST creates list with separator and sysvar", res["s1"] == 200 and res["created"]["name"] == "ZZTestFav" and [i["type"] for i in res["created"]["items"]] == ["SEPARATOR", "SYSVAR"], repr(res["created"]))
                check("real ReGa: GET lists the created list for the user", any(x["id"] == real_id for x in res["listed"]["lists"]))
                check("real ReGa: POST with id updates name, info and members", res["s3"] == 200 and res["updated"]["name"] == "ZZTestFav2" and [i["id"] for i in res["updated"]["items"]] == ["950"], repr(res["updated"]))
                check("real ReGa: unknown channel member is rejected with 422", res["s4"] == 422)
                check("real ReGa: DELETE removes the list", res["s5"] == 200 and res["deleted"] == {"id": real_id, "deleted": True} and not any(x["id"] == real_id for x in res["after"]["lists"]))
            finally:
                if real_id:
                    pg.evaluate("async ([sid, id]) => fetch('/api/homematic.cgi/v2/favourites?id=' + id, {method: 'DELETE', headers: {'X-Requested-With': 'XMLHttpRequest', 'X-Session-Id': sid}})", [sid, real_id])

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
