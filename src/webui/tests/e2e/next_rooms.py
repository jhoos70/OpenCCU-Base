#!/usr/bin/env python3
"""Browser test of the Rooms and Functions pages of the nextGen UI (tiles with live values).

    python3 next_rooms.py --base http://127.0.0.1:18080 --user Admin --password Admin

The test CCU has no device, so the device model, the rooms, the functions, the values of the channels and the answers to
a command are mocked (the routes are proven by the Tcl tests and against restored real data); login, profile and the pages
are real. Checks: rooms and functions as buttons; tiles by channel type (window contact, heating incl. a wall thermostat,
shutter with its feedback channel, dimmer, motion sensor, button, socket with meter); the channels a room holds that carry
nothing are not shown (and counted); two channels with the same title keep their full names; sorted by name; a dimmer
command; a button; an empty function; German; an expired session. Nothing on the CCU is changed. Always signs out.
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
    device("1", "Küche Fenster", "C1", "HM-Sec-SCo", [("11", 1, "Küche Fenster:1", "SHUTTER_CONTACT")]),
    device("2", "Küche Tür", "C2", "HM-Sec-SCo", [("21", 1, "Küche Tür:1", "SHUTTER_CONTACT")]),
    device("3", "Küche Thermostat", "T1", "HM-TC-IT-WM-W-EU", [("31", 1, "Küche Thermostat:1", "WEATHER_TRANSMIT"), ("32", 2, "Küche Thermostat:2", "THERMALCONTROL_TRANSMIT"), ("33", 3, "Küche Thermostat:3", "WINDOW_SWITCH_RECEIVER"), ("34", 4, "Küche Thermostat:4", "REMOTECONTROL_RECEIVER")]),
    device("4", "Rollladen Küche", "S1", "HmIP-BROLL", [("41", 3, "Rollladen Küche:3", "SHUTTER_TRANSMITTER"), ("42", 4, "Rollladen Küche:4", "SHUTTER_VIRTUAL_RECEIVER"), ("43", 5, "Rollladen Küche:5", "BLIND_WEEK_PROFILE"), ("44", 1, "Rollladen Küche:1", "KEY_TRANSCEIVER")]),
    device("5", "Licht Küche", "L1", "VIR-LG-WHITE-DIM", [("51", 1, "Licht Küche:1", "VIR-LG-WHITE-DIM-CH")]),
    device("6", "Bewegung Keller", "M1", "HM-Sen-MDIR-O-3", [("61", 1, "Bewegung Keller:1", "MOTION_DETECTOR")]),
    device("7", "Schalter Kaffee", "K1", "HM-PB-2-WM55", [("71", 1, "Schalter Kaffee:1", "KEY"), ("72", 2, "Schalter Kaffee:2", "KEY")]),
    device("8", "Steckdose Server", "P1", "HMIP-PSM", [("81", 2, "Steckdose Server:2", "SWITCH_TRANSMITTER"), ("82", 3, "Steckdose Server:3", "SWITCH_VIRTUAL_RECEIVER"), ("83", 6, "Steckdose Server:6", "ENERGIE_METER_TRANSMITTER")]),
    device("9", "Ventil Keller", "H1", "HmIP-HEATING", [("91", 1, "Ventil Keller:1", "HEATING_CLIMATECONTROL_TRANSCEIVER"), ("92", 2, "Ventil Keller:2", "SWITCH_TRANSMITTER")]),
]

ROOMS = [
    {"id": "r1", "name": "Küche", "description": "Hier wird gekocht", "channelIds": ["82", "83", "81", "42", "41", "43", "44", "11", "21", "31", "32", "33", "34", "51"]},
    {"id": "r2", "name": "Keller", "description": "", "channelIds": ["61", "91", "92"]},
    {"id": "r3", "name": "Leer", "description": "", "channelIds": []},
]
FUNCTIONS = [
    {"id": "f1", "name": "Taster", "description": "", "channelIds": ["71", "72"]},
    {"id": "f2", "name": "Verschluss", "description": "", "channelIds": ["11", "21"]},
    {"id": "f3", "name": "Brandmelder", "description": "", "channelIds": []},
]


def dp(id, ch, param, type, value, **kw):
    cid, addr, idx, cname = ch
    d = {"id": id, "name": "BidCos-RF.%s:%d.%s" % (addr, idx, param), "channelId": cid, "channel": cname, "param": param, "type": type, "value": value, "unit": "", "min": "", "max": "", "valueList": "",
         "timestamp": "2026-11-01 10:00:00", "integer": False, "readable": True, "writable": False}
    d.update(kw)
    return d


def values():
    return [
        dp("1", ("11", "C1", 1, "Küche Fenster:1"), "STATE", "LOGIC", "true"),
        dp("2", ("21", "C2", 1, "Küche Tür:1"), "STATE", "LOGIC", "false"),
        dp("3", ("31", "T1", 1, "Küche Thermostat:1"), "TEMPERATURE", "NUMBER", "20.5", unit="°C"),
        dp("4", ("32", "T1", 2, "Küche Thermostat:2"), "SET_TEMPERATURE", "NUMBER", "21.000000", unit="°C", min="4.5", max="30.5", writable=True),
        dp("5", ("32", "T1", 2, "Küche Thermostat:2"), "ACTUAL_TEMPERATURE", "NUMBER", "20.500000", unit="°C"),
        dp("6", ("41", "S1", 3, "Rollladen Küche:3"), "LEVEL", "NUMBER", "0.300000", min="0.000000", max="1.010000"),
        dp("7", ("42", "S1", 4, "Rollladen Küche:4"), "LEVEL", "NUMBER", "0.900000", min="0.000000", max="1.010000", writable=True),
        dp("8", ("42", "S1", 4, "Rollladen Küche:4"), "STOP", "ACTION", "", writable=True),
        dp("9", ("51", "L1", 1, "Licht Küche:1"), "LEVEL", "NUMBER", "0.200000", min="0.000000", max="1.000000", writable=True),
        dp("10", ("61", "M1", 1, "Bewegung Keller:1"), "MOTION", "LOGIC", "false"),
        dp("12", ("61", "M1", 1, "Bewegung Keller:1"), "BRIGHTNESS", "NUMBER", "120", integer=True),
        dp("13", ("71", "K1", 1, "Schalter Kaffee:1"), "PRESS_SHORT", "ACTION", "", writable=True),
        dp("14", ("72", "K1", 2, "Schalter Kaffee:2"), "PRESS_SHORT", "ACTION", "", writable=True),
        dp("15", ("81", "P1", 2, "Steckdose Server:2"), "STATE", "LOGIC", "true"),
        dp("16", ("82", "P1", 3, "Steckdose Server:3"), "STATE", "LOGIC", "true", writable=True),
        dp("17", ("83", "P1", 6, "Steckdose Server:6"), "POWER", "NUMBER", "85", unit="W"),
        dp("18", ("91", "H1", 1, "Ventil Keller:1"), "SET_POINT_TEMPERATURE", "NUMBER", "19.0", unit="°C", min="4.5", max="30.5", writable=True),
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True); ap.add_argument("--user", default="Admin"); ap.add_argument("--password", required=True); ap.add_argument("--shots", default="")
    a = ap.parse_args()
    results, console, posts = [], [], []

    def check(name, ok, detail=""):
        results.append(ok); print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    st = {"vals": values(), "rooms_status": 200}
    ok = lambda body: dict(status=200, content_type="application/json", body=json.dumps(body))

    def on_values(route):
        req = route.request
        if req.method == "POST":
            body = json.loads(req.post_data)
            posts.append(body)
            d = next(x for x in st["vals"] if x["id"] == body["id"])
            if d["type"] == "NUMBER":
                d["value"] = "%f" % float(body["value"])
            return route.fulfill(**ok(d))
        route.fulfill(**ok({"channels": "", "items": st["vals"]}))

    def on_model(route):
        url = route.request.url
        if "sections=devices" in url:
            return route.fulfill(**ok({"devices": {"total": len(DEVICES), "offset": 0, "limit": 500, "items": DEVICES}}))
        key = "rooms" if "sections=rooms" in url else "functions"
        if st["rooms_status"] != 200:
            return route.fulfill(status=st["rooms_status"], content_type="application/json", body=json.dumps({"error": {"code": 400, "message": "x"}}))
        items = ROOMS if key == "rooms" else FUNCTIONS
        route.fulfill(**ok({key: {"total": len(items), "offset": 0, "limit": 500, "items": items}}))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1280, "height": 1000})
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and console.append(m.text[:140]))
        pg.on("pageerror", lambda e: console.append("pageerror: " + str(e)[:140]))
        pg.route("**/v2/values*", on_values)
        pg.route("**/v2/model?sections=*", on_model)
        pg.route("**/v2/profile", lambda r: r.fulfill(**ok(PROFILE)))
        tile = lambda title: pg.locator("article", has=pg.get_by_role("heading", name=title, exact=True))
        titles = lambda: pg.locator("article h3").all_inner_texts()
        try:
            pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.get_by_role("link", name="Rooms", exact=True).first.click()
            pg.get_by_role("heading", name="Küche Fenster").wait_for()
            if a.shots:
                pg.screenshot(path=a.shots + "/rooms-kueche.png", clip={"x": 0, "y": 60, "width": 1280, "height": 1000})

            check("rooms are buttons, the first is open", pg.locator("[role=group] button").all_inner_texts() == ["Küche", "Keller", "Leer"] and pg.get_by_role("button", name="Open the list Küche").get_attribute("aria-pressed") == "true")
            check("the description of the room is shown", pg.get_by_text("Hier wird gekocht").is_visible())
            check("tiles are sorted by name; two tiles of one device with the same title keep the full names; a shutter and its feedback are one tile", titles() == ["Küche Fenster", "Küche Thermostat:1", "Küche Thermostat:2", "Küche Tür", "Licht Küche", "Rollladen Küche", "Steckdose Server"], repr(titles()))
            check("what a room holds without a state worth a tile is counted, not shown", pg.get_by_text("Not shown: 4").is_visible(), "(week profile, wall key, window and remote channels of the thermostat)")

            check("an open window contact says open, a closed one closed", "Open" in tile("Küche Fenster").inner_text() and "Closed" in tile("Küche Tür").inner_text() and tile("Küche Fenster").locator("button").count() == 0)
            check("the wall thermostat is a heating tile with its setpoint", "21.0" in pg.locator("article", has=pg.get_by_role("button", name="Raise the target temperature")).first.inner_text())
            sh = tile("Rollladen Küche")
            check("a shutter shows the position of its feedback channel (30 %) and operates the control channel", "30" in sh.inner_text())
            sh.get_by_role("button", name="Open").click()
            sh.get_by_text("confirmed", exact=False).wait_for(timeout=15000)
            check("open writes the level of the control channel", posts[-1] == {"id": "7", "value": "1"}, repr(posts[-1]))

            # a dimmer: the slider rests, then one command goes out
            lamp = tile("Licht Küche")
            check("a light shows its level", "20" in lamp.inner_text())
            before = len(posts)
            lamp.locator("input[type=range]").fill("50")
            check("the slider sends nothing at once", len(posts) == before)
            lamp.get_by_text("Brightness 50 % confirmed", exact=False).wait_for(timeout=15000)
            check("the slider sends one command with the level", posts[-1] == {"id": "9", "value": "0.50"}, repr(posts[-1]))
            sock = tile("Steckdose Server")
            check("a socket, its feedback and its meter are one tile", sock.get_by_role("switch").get_attribute("aria-checked") == "true" and "85 W now" in sock.inner_text())

            # keller: motion, the heating actuator's switch feedback is not a tile
            pg.get_by_role("button", name="Open the list Keller").click()
            pg.get_by_role("heading", name="Bewegung Keller", exact=True).wait_for()
            check("a motion sensor says no motion and shows the brightness", titles() == ["Bewegung Keller", "Ventil Keller"] and "No motion" in tile("Bewegung Keller").inner_text() and "120" in tile("Bewegung Keller").inner_text(), repr(titles()))
            check("the switch feedback of a heating actuator is not a tile of its own", pg.get_by_text("Not shown: 1").is_visible())
            pg.get_by_role("button", name="Open the list Leer").click()
            check("an empty room says so", pg.get_by_text("Nothing here.").is_visible())

            # functions
            pg.get_by_role("link", name="Functions", exact=True).first.click()
            pg.get_by_role("button", name="Open the list Taster").wait_for()
            pg.get_by_role("heading", name="Schalter Kaffee:1").wait_for()
            check("two keys of one device keep their full names", titles() == ["Schalter Kaffee:1", "Schalter Kaffee:2"], repr(titles()))
            tile("Schalter Kaffee:2").get_by_role("button", name="Short press").click()
            tile("Schalter Kaffee:2").get_by_text("Short press sent").wait_for(timeout=5000)
            check("a key is pressed: sent, nothing to confirm", posts[-1] == {"id": "14", "value": True}, repr(posts[-1]))
            pg.get_by_role("button", name="Open the list Verschluss").click()
            pg.get_by_role("heading", name="Küche Tür", exact=True).wait_for()
            check("a function of window contacts is a grid of read-only tiles", titles() == ["Küche Fenster", "Küche Tür"])
            pg.get_by_role("button", name="Open the list Brandmelder").click()
            check("an empty function says so", pg.get_by_text("Nothing here.").is_visible())

            # German, expired
            pg.get_by_role("button", name="Account menu").click(); pg.get_by_role("menuitemradio", name="Deutsch").click()
            pg.get_by_role("link", name="Gewerke", exact=True).first.wait_for()
            pg.get_by_role("link", name="Räume", exact=True).first.click()
            pg.get_by_role("heading", name="Küche Fenster").wait_for()
            check("German texts", tile("Küche Fenster").get_by_text("Offen").is_visible() and tile("Küche Tür").get_by_text("Geschlossen").is_visible())
            st["rooms_status"] = 401
            pg.get_by_role("link", name="Gewerke", exact=True).first.click()
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
