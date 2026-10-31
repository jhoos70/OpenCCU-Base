#!/usr/bin/env python3
"""Browser test of the live values and the operation of a device in the nextGen UI (Devices, expanded row).

    python3 next_values.py --base http://127.0.0.1:18080 --user Admin --password Admin

The test CCU has no device and no interface that takes a command, so the device list, /values and the answers
to a command are mocked (the real route is proven by the Tcl tests and by api calls against restored real data). The
login, the profile route and the page itself are real. Checks: what is shown (values, units, list entries, "no value
yet"), the yes/no buttons, a button, a number field with its range, a list, the OK / Cancel / Escape handling, the
focus, what a refused command (HTTP 502) and an invalid value say, a guest (no controls), German and an expired
session. Nothing on the CCU is changed. Always signs out.
"""
import argparse, json, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon", "Failed to load resource")
PROFILE = {"userId": "1004", "userName": "Admin", "firstName": "Admin", "hasPassword": True, "isNoExpert": True, "language": "", "level": "ADMIN"}
DEV = {"id": "50", "name": "Wohnzimmer Heizung", "address": "MEQ1", "interface": "BidCos-RF", "type": "HM-CC-RT-DN", "operateGroupOnly": "false", "isReady": True,
       "channels": [{"id": "51", "name": "Wohnzimmer Heizung:4", "address": "MEQ1:4", "deviceId": "50", "index": 4, "partnerId": "", "mode": "MODE_DEFAULT", "category": "CATEGORY_RECEIVER", "isReady": True, "isUsable": True, "isVisible": True, "isLogged": False, "isEventable": True, "isReadable": True, "isWritable": True, "isVirtual": False, "isAesAvailable": False, "channelType": "CLIMATECONTROL_RT_TRANSCEIVER"}]}


def dp(id, param, type, value, **kw):
    d = {"id": id, "name": "BidCos-RF.MEQ1:4." + param, "channelId": "51", "channel": "Wohnzimmer Heizung:4", "param": param, "type": type, "value": value, "unit": "", "min": "", "max": "",
         "valueList": "", "timestamp": "2026-11-01 10:00:00", "integer": False, "readable": True, "writable": True}
    d.update(kw)
    return d


def items():
    return [
        dp("1", "ACTUAL_TEMPERATURE", "NUMBER", "19.25", unit="°C", min="-10.0", max="56.0", writable=False),
        dp("2", "SET_TEMPERATURE", "NUMBER", "21.0", unit="°C", min="4.5", max="30.5"),
        dp("3", "CONTROL_MODE", "LIST", "1", valueList="AUTO-MODE;MANU-MODE;PARTY-MODE", min="0", max="2"),
        dp("4", "WINDOW_OPEN", "LOGIC", "false", min="false", max="true"),
        dp("5", "BOOST_MODE", "ACTION", "", min="false", max="true"),
        dp("6", "VALVE_STATE", "NUMBER", "0", unit="%", integer=True, min="0", max="99", writable=False, timestamp="1970-01-01 01:00:00"),
        dp("7", "LABEL", "STRING", "Bad"),
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--user", default="Admin")
    ap.add_argument("--password", required=True)
    a = ap.parse_args()
    results, console, posts = [], [], []

    def check(name, ok, detail=""):
        results.append(ok)
        print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    st = {"values": items(), "post": None, "profile": None, "values_status": 200}

    def on_model(route):
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"devices": {"total": 1, "offset": 0, "limit": 500, "items": [DEV]}}))

    def on_values(route):
        req = route.request
        if req.method == "POST":
            posts.append(json.loads(req.post_data))
            status, body = st["post"]
            return route.fulfill(status=status, content_type="application/json", body=json.dumps(body))
        if st["values_status"] != 200:
            return route.fulfill(status=st["values_status"], content_type="application/json", body=json.dumps({"error": {"code": 401, "message": "x"}}))
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"device": "50", "items": st["values"]}))

    def on_profile(route):
        route.fulfill(status=200, content_type="application/json", body=json.dumps({**PROFILE, **(st["profile"] or {})}))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1280, "height": 1000})
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and console.append(m.text[:140]))
        pg.route("**/v2/model?sections=devices*", on_model)
        pg.route("**/v2/values*", on_values)
        pg.route("**/v2/profile", on_profile)
        try:
            pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
            pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.get_by_role("link", name="Devices", exact=True).click()
            pg.get_by_role("button", name="Show channels of Wohnzimmer Heizung").click()
            pg.get_by_role("button", name="Change SET_TEMPERATURE").wait_for()
            row = lambda param: pg.locator("tbody tbody tr", has=pg.get_by_text(param, exact=True))
            check("the page says status and control", pg.get_by_text("Status and control").first.is_visible())
            check("a number shows its unit and decimals", "21.0 °C" in row("SET_TEMPERATURE").inner_text() and "19.25 °C" in row("ACTUAL_TEMPERATURE").inner_text())
            check("a list shows the entry, not the index", "MANU-MODE" in row("CONTROL_MODE").inner_text())
            check("a logic value shows no", "no" in row("WINDOW_OPEN").inner_text().lower())
            check("a value never reported shows a dash, not the default", "–" in row("VALVE_STATE").inner_text() and "0 %" not in row("VALVE_STATE").inner_text())
            check("a read-only value has no control", row("ACTUAL_TEMPERATURE").locator("button").count() == 0)

            # yes / no buttons
            st["post"] = (200, dp("4", "WINDOW_OPEN", "LOGIC", "true"))
            pg.get_by_role("button", name="Set WINDOW_OPEN to yes").click()
            pg.get_by_text("WINDOW_OPEN: command sent").wait_for()
            check("yes sends a boolean true", posts[-1] == {"id": "4", "value": True}, repr(posts[-1]))
            check("the answer says sent, not done", "when the device reports back" in pg.get_by_text("WINDOW_OPEN: command sent").inner_text())
            st["post"] = (200, dp("4", "WINDOW_OPEN", "LOGIC", "false"))
            pg.get_by_role("button", name="Set WINDOW_OPEN to no").click()
            pg.wait_for_function("(n) => true", arg=0)
            check("no sends a boolean false", posts[-1] == {"id": "4", "value": False}, repr(posts[-1]))

            # a button
            st["post"] = (200, dp("5", "BOOST_MODE", "ACTION", ""))
            pg.get_by_role("button", name="Send BOOST_MODE").click()
            pg.get_by_text("BOOST_MODE: command sent").wait_for()
            check("a button sends true", posts[-1] == {"id": "5", "value": True}, repr(posts[-1]))

            # a number field: range, OK, Cancel, Escape, focus
            pg.get_by_role("button", name="Change SET_TEMPERATURE").click()
            field = pg.get_by_label("SET_TEMPERATURE", exact=True)
            check("the field has the focus and shows the current value", field.evaluate("e => e === document.activeElement") and field.input_value() == "21")
            check("the range is shown", pg.get_by_text("Allowed: 4.5 to 30.5.").is_visible())
            ok = pg.get_by_role("button", name="OK")
            check("OK is off while nothing changed", ok.is_disabled())
            field.fill("31")
            check("a value outside the range says so and OK stays off", pg.get_by_text("The value is outside the allowed range.").is_visible() and ok.is_disabled())
            before = len(posts)
            field.press("Escape")
            check("Escape cancels without sending", len(posts) == before and pg.get_by_role("button", name="Change SET_TEMPERATURE").is_visible())
            check("the focus returns to the Change button", pg.evaluate("document.activeElement.getAttribute('aria-label')") == "Change SET_TEMPERATURE")
            pg.get_by_role("button", name="Change SET_TEMPERATURE").click()
            pg.get_by_label("SET_TEMPERATURE", exact=True).fill("22.5")
            st["post"] = (200, dp("2", "SET_TEMPERATURE", "NUMBER", "22.5", unit="°C", min="4.5", max="30.5"))
            pg.get_by_role("button", name="OK").click()
            pg.get_by_text("SET_TEMPERATURE: command sent").wait_for()
            check("OK sends the number as typed", posts[-1] == {"id": "2", "value": "22.5"}, repr(posts[-1]))
            check("the editor closes after a send", pg.get_by_role("button", name="Change SET_TEMPERATURE").is_visible())

            # a refused command (the CCU's interface does not respond) keeps the editor and says why
            pg.get_by_role("button", name="Change SET_TEMPERATURE").click()
            pg.get_by_label("SET_TEMPERATURE", exact=True).fill("23")
            st["post"] = (502, {"error": {"code": 501, "message": "the device interface did not take the command"}})
            pg.get_by_role("button", name="OK").click()
            pg.get_by_role("alert").filter(has_text="did not pass the command on").wait_for()
            check("a refused command is an error, not 'sent'", pg.get_by_role("alert").filter(has_text="did not pass the command on").is_visible() and pg.get_by_text("SET_TEMPERATURE: command sent").count() == 0)
            check("the editor stays open for a retry", pg.get_by_role("button", name="OK").is_visible())
            pg.get_by_role("button", name="Cancel").click()

            # a list
            pg.get_by_role("button", name="Change CONTROL_MODE").click()
            sel = pg.get_by_label("CONTROL_MODE", exact=True)
            check("a list offers its entries", sel.locator("option").all_inner_texts() == ["AUTO-MODE", "MANU-MODE", "PARTY-MODE"])
            sel.select_option("2")
            st["post"] = (200, dp("3", "CONTROL_MODE", "LIST", "2", valueList="AUTO-MODE;MANU-MODE;PARTY-MODE"))
            pg.get_by_role("button", name="OK").click()
            pg.get_by_text("CONTROL_MODE: command sent").wait_for()
            check("a list sends the index", posts[-1] == {"id": "3", "value": "2"}, repr(posts[-1]))

            # German
            pg.get_by_role("button", name="Account menu").click(); pg.get_by_role("menuitemradio", name="Deutsch").click()
            pg.get_by_role("button", name="WINDOW_OPEN auf ja setzen").wait_for()
            check("German texts", pg.get_by_text("Werte", exact=True).is_visible() and pg.get_by_text("Status und Bedienung").first.is_visible())

            # a user (not an administrator) may operate too; a guest has no pages in the new UI at all
            st["profile"] = {"level": "USER"}
            pg.reload()
            pg.get_by_role("button", name="Kanäle von Wohnzimmer Heizung anzeigen").click()
            pg.get_by_role("button", name="SET_TEMPERATURE ändern").wait_for()
            check("a user has the controls", pg.get_by_role("button", name="WINDOW_OPEN auf ja setzen").is_visible())
            st["profile"] = {"level": "GUEST"}
            pg.reload(); pg.get_by_text("noch keine Seiten").wait_for()
            check("a guest has no pages, so no controls", pg.locator("tbody button").count() == 0)
            st["profile"] = {"level": "USER"}
            pg.reload()
            pg.get_by_role("button", name="Kanäle von Wohnzimmer Heizung anzeigen").click()
            pg.get_by_role("button", name="SET_TEMPERATURE ändern").wait_for()

            # an expired session returns to the sign-in form
            st["values_status"] = 401
            pg.get_by_role("button", name="Aktualisieren").click()
            pg.wait_for_selector("#user", timeout=15000)
            check("an expired session returns to the sign-in form", pg.evaluate("sessionStorage.length") == 0)
            check("no browser errors", not console, "; ".join(console[:3]))
        finally:
            try:
                pg.unroute_all()
                pg.reload()
                pg.get_by_role("button", name="Account menu").click(timeout=3000); pg.get_by_role("menuitem", name="Sign out").click(timeout=3000)
            except Exception:
                pass
            browser.close()
    print("%d PASS, %d FAIL" % (sum(results), len(results) - sum(results)))
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
