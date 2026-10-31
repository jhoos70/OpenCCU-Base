#!/usr/bin/env python3
"""Browser test of the German texts and the Devices page of the nextGen UI.

    python3 next_i18n_devices.py --base http://127.0.0.1:18080 --user Admin --password Admin

German: the browser language decides (de-DE), a switch changes it and the choice is remembered; value names
of system variables that are ${key} references are resolved from the classic UI's language files.
Devices: the test CCU has none, so the real answer is the empty state; a mocked model answer with realistic
devices (shape of v2/model.tcl) covers sorting, filter, descriptions in the language of the user, channels,
and the narrow layout. Always signs out.
"""
import argparse, json, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon")


def ch(i, name, typ, dev):
    return {"id": "%s%02d" % (dev, i), "name": name, "address": "A:%d" % i, "deviceId": dev, "index": i, "channelType": typ, "category": "CATEGORY_NONE"}


DEVICES = {"devices": {"total": 3, "offset": 0, "limit": 500, "items": [
    {"id": "2001", "name": "Küche Heizung", "address": "0001", "interface": "HmIP-RF", "type": "HmIP-eTRV-B", "isReady": True,
     "channels": [ch(1, "Küche Heizung:1", "HEATING_CLIMATECONTROL_TRANSCEIVER", "2001"), ch(0, "Küche Heizung:0", "MAINTENANCE", "2001")]},
    {"id": "2002", "name": "Büro Licht", "address": "0002", "interface": "BidCos-RF", "type": "HM-LC-Sw1-Pl", "isReady": True,
     "channels": [ch(0, "Büro Licht:0", "MAINTENANCE", "2002"), ch(1, "Büro Licht:1", "SWITCH", "2002")]},
    {"id": "2003", "name": "Fenster 10", "address": "0003", "interface": "HmIP-RF", "type": "HmIP-SWDO", "isReady": True, "channels": []},
]}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--user", default="Admin")
    ap.add_argument("--password", required=True)
    a = ap.parse_args()
    results, console = [], []

    def check(name, ok, detail=""):
        results.append(ok)
        print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    def login(pg, user_label, pw_label):
        pg.get_by_label(user_label).fill(a.user); pg.get_by_label(pw_label).fill(a.password); pg.keyboard.press("Enter")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(locale="de-DE", viewport={"width": 1100, "height": 800})
        pg = ctx.new_page()
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and console.append(m.text[:140]))
        out_label = None
        try:
            # ---- German by browser language
            pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
            check("login is German for a German browser", pg.get_by_role("button", name="Anmelden").is_visible() and pg.locator("label[for=user]").inner_text() == "Benutzername")
            check("html lang follows the language", pg.evaluate("document.documentElement.lang") == "de")
            login(pg, "Benutzername", "Passwort")
            pg.get_by_role("button", name="Benutzermenü").wait_for(); out_label = "Benutzermenü"
            pg.wait_for_selector("aside nav li a")  # the nav follows once the profile has loaded
            tabs = [t.strip() for t in pg.locator("aside nav li a").all_inner_texts()]
            check("the navigation is German", tabs == ["Übersicht", "Geräte", "Räume", "Systemvariablen"], str(tabs))

            # ---- the real, empty device list
            pg.get_by_role("link", name="Geräte").click(); pg.get_by_text("Keine Geräte verfügbar.").wait_for()
            check("an empty device list says so in German", True)

            # ---- sysvars: ${key} value names come from the classic language files
            pg.get_by_role("link", name="Systemvariablen").click(); pg.wait_for_selector("tbody tr")
            row = pg.locator("tbody tr", has_text="Alarmzone 1")
            pg.wait_for_function("document.body.innerText.includes('nicht ausgelöst')", timeout=10000)
            check("a ${key} value name is resolved from the classic strings", "nicht ausgelöst" in row.inner_text(), row.inner_text().replace("\t", " | "))
            check("no raw ${...} key is shown", "${" not in pg.inner_text("main"))

            # ---- switch language, remembered across reload
            pg.get_by_role("button", name="Benutzermenü").click(); pg.get_by_role("menuitemradio", name="English").click()
            pg.get_by_role("heading", name="System variables").wait_for()
            check("the switch changes the language", pg.evaluate("document.documentElement.lang") == "en" and "Read only" in pg.inner_text("main"))
            check("an English fallback is shown when the classic English file lacks the key", "not triggered" in pg.locator("tbody tr", has_text="Alarmzone 1").inner_text())
            pg.reload(); pg.get_by_role("heading", name="System variables").wait_for()
            check("the choice survives a reload", pg.evaluate("localStorage.getItem('openccu.next.lang')") == "en")
            pg.get_by_role("button", name="Account menu").click(); pg.get_by_role("menuitemradio", name="Deutsch").click(); pg.get_by_role("heading", name="Systemvariablen").wait_for()

            # ---- devices with a mocked model
            def fulfil(route):
                if "sections=devices" in route.request.url:
                    route.fulfill(status=200, content_type="application/json; charset=utf-8", body=json.dumps(DEVICES))
                else:
                    route.continue_()
            pg.route("**/v2/model?*", fulfil)
            pg.get_by_role("link", name="Geräte").click(); pg.get_by_label("Filter").wait_for()
            pg.wait_for_function("document.body.innerText.includes('Funk-Schaltaktor')", timeout=10000)  # descriptions load after the table
            names = [r.split("\t")[0].strip("▸▾ \n") for r in pg.locator("tbody > tr").all_inner_texts()]
            check("devices are sorted by name in German order", names == ["Büro Licht", "Fenster 10", "Küche Heizung"], str(names))
            body = pg.inner_text("main")
            check("a known device type shows its German description", "Funk-Schaltaktor 1-fach, Zwischenstecker" in body and "Homematic IP Fenster- und Türkontakt - optisch" in body)
            check("an unknown device type is shown without a description", "HmIP-eTRV-B" in body and "undefined" not in body)

            pg.get_by_label("Filter").fill("schaltaktor")
            check("the filter matches the description", pg.locator("tbody > tr").count() == 1 and "Büro Licht" in pg.inner_text("main"))
            pg.get_by_label("Filter").fill("hmip-rf küche")
            check("the filter needs every word", pg.locator("tbody > tr").count() == 1 and "Küche Heizung" in pg.inner_text("main"))
            pg.get_by_label("Filter").fill("gibtesnicht")
            check("no match says so", pg.get_by_text("Kein Gerät entspricht dem Filter.").is_visible())
            pg.get_by_label("Filter").fill("")

            btn = pg.get_by_role("button", name="Kanäle von Büro Licht anzeigen")
            check("channels are collapsed first", btn.get_attribute("aria-expanded") == "false")
            btn.click()
            exp = pg.get_by_role("button", name="Kanäle von Büro Licht ausblenden")
            check("a click shows the channels, sorted by number", exp.get_attribute("aria-expanded") == "true" and pg.inner_text("main").index("MAINTENANCE") < pg.inner_text("main").index("SWITCH"))
            exp.click()
            check("a second click hides them", "SWITCH" not in pg.inner_text("main"))

            pg.set_viewport_size({"width": 375, "height": 740})
            check("narrow screen: no sideways page scroll", not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
            check("narrow screen: address column is hidden", not pg.get_by_role("columnheader", name="Adresse").is_visible())
            check("no console errors", not console, str(console))
        finally:
            if out_label:
                try:
                    pg.unroute("**/v2/model?*")
                    pg.get_by_role("button", name=out_label).click(timeout=5000); pg.get_by_role("menuitem", name="Abmelden").click(timeout=5000)
                except Exception:
                    pass
            browser.close()
    print("\n%d PASS, %d FAIL" % (results.count(True), results.count(False)))
    return 1 if False in results else 0


if __name__ == "__main__":
    sys.exit(main())
