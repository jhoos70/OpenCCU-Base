#!/usr/bin/env python3
"""Browser smoke test of the CLASSIC WebUI (read-only walk through the menu).

    python3 classic_smoke.py --base http://127.0.0.1:18080 --user Admin --password Admin --out a.json

For every menu page it records the visible text, failed HTTP requests, JSON-RPC errors and console
errors. Run it against two instances (e.g. stock and patched) and diff the reports with
compare_reports.py. It never changes configuration; it only handles first-run dialogs that cover the
page (security hint, system language) and always logs out, because the CCU limits concurrent sessions.
"""
import argparse, json, re, sys
from playwright.sync_api import sync_playwright

# (menu title id, submenu id or None, label). IDs come from the classic shell (webui.js menu).
PAGES = [
    ("menuStartPage", None, "start"),
    ("menuControlPage", "submenuFavorites", "favorites"),
    ("menuControlPage", "submenuDevices", "devices"),
    ("menuControlPage", "submenuFunction", "functions"),
    ("menuControlPage", "submenuRooms", "rooms"),
    ("menuControlPage", "submenuPrograms", "programs"),
    ("menuControlPage", "submenuSysVar", "sysvars"),
    ("menuControlPage", "submenuSysProtocol", "protocol"),
    ("menuControlPage", "submenuDiagramListPage", "diagrams"),
    ("menuProgramsLinksPage", "submenuDirectLinks", "direct-links"),
    ("menuProgramsLinksPage", "submenuProgramsLinks", "programs-links"),
    ("menuProgramsLinksPage", "submenuScriptExecutor", "script-executor"),
    ("menuSettingsPage", "submenuDevices", "settings-devices"),
    ("menuSettingsPage", "submenuDeviceInbox", "settings-inbox"),
    ("menuSettingsPage", "submenuDeviceFirmwareInformation", "settings-firmware"),
    ("menuSettingsPage", "submenuFunction", "settings-functions"),
    ("menuSettingsPage", "submenuRooms", "settings-rooms"),
    ("menuSettingsPage", "submenuCreateGroups", "settings-groups"),
    ("menuSettingsPage", "submenuSysVar", "settings-sysvars"),
    ("menuSettingsPage", "submenuUserManagement", "settings-users"),
    ("menuSettingsPage", "submenuSysControl", "settings-control"),
    ("menuNewDevicesPage", None, "new-devices"),
    ("menuHelpPage", None, "help"),  # system information dialog: stays open, so it goes last
]

# Pages whose text is system state (uptime, memory, IP, hostname): only status is compared.
VOLATILE = ("help",)

# Browser noise that exists on the stock UI as well and says nothing about a change.
NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon")


def norm(text):
    text = re.sub(r"@[A-Za-z0-9]{10}@", "@SID@", text)
    text = re.sub(r"\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b", "DATE", text)
    text = re.sub(r"\b\d{1,2}:\d{2}(:\d{2})?\b", "TIME", text)
    text = re.sub(r"\b\d+\.\d+ \d+\.\d+ \d+\.\d+\b", "LOADAVG", text)
    return re.sub(r"\s+", " ", text).strip()[:1500]


def click(pg, sel):
    loc = pg.locator(sel)
    if not loc.count():
        return False
    loc.first.evaluate("e => e.click()")
    return True


def settle(pg, ms=1200):
    try:
        pg.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass
    pg.wait_for_timeout(ms)


def dismiss_dialogs(pg, seen):
    """Click through first-run dialogs (security hint, language). Bounded; no password is set here."""
    for _ in range(8):
        texts = [t.strip() for t in pg.locator("div[id*=tn]:visible, div[class*=Button]:visible").all_inner_texts()]
        titles = pg.locator("[class*=Title]:visible").all_inner_texts()
        if pg.locator("input[type=checkbox]:visible").count():
            pg.locator("input[type=checkbox]:visible").first.check()
        if not any(t in ("Next", "OK", "Finish", "Continue") for t in texts):
            return
        seen.append(norm(" / ".join(titles))[:80])
        for name in ("Next", "Finish", "Continue", "OK"):
            idx = [i for i, t in enumerate(texts) if t == name]
            if idx:
                pg.locator("div[id*=tn]:visible, div[class*=Button]:visible").nth(idx[-1]).evaluate("e => e.click()")
                break
        settle(pg, 800)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--user", default="Admin")
    ap.add_argument("--password", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--shots", help="directory for screenshots")
    a = ap.parse_args()

    report = {"base": a.base, "dialogs": [], "pages": {}}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1280, "height": 900})
        cur = {"http": [], "rpc": [], "console": []}

        def on_response(r):
            if r.status >= 400 and not any(n in r.url for n in NOISE):
                cur["http"].append("%s %s" % (r.status, re.sub(r"sid=@?[A-Za-z0-9]+@?", "sid=SID", r.url.replace(a.base, ""))))
            if "/api/homematic.cgi" in r.url:
                try:
                    d = r.json()
                    if isinstance(d, dict) and d.get("error"):
                        cur["rpc"].append(str(d["error"].get("code")) + " " + str(d["error"].get("message"))[:80])
                except Exception:
                    pass

        pg.on("response", on_response)
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and cur["console"].append(m.text[:160]))
        pg.on("pageerror", lambda e: cur["console"].append("pageerror: " + str(e)[:160]))
        try:
            pg.goto(a.base + "/login.htm")
            pg.fill("#UserNameShow", a.user)
            pg.fill("#Password", a.password)
            pg.keyboard.press("Enter")
            settle(pg, 2500)
            report["logged_in"] = "/pages/index.htm" in pg.url
            if not report["logged_in"]:
                report["login_page_text"] = norm(pg.inner_text("body"))
            else:
                dismiss_dialogs(pg, report["dialogs"])
                for menu, sub, label in PAGES:
                    cur.update(http=[], rpc=[], console=[])
                    ok = click(pg, "#%s_TITLE" % menu) or click(pg, "#%s" % menu)
                    settle(pg, 600)
                    if sub:
                        ok = click(pg, "#%s_SUBMENU #%s" % (menu, sub)) and ok
                    settle(pg)
                    dismiss_dialogs(pg, report["dialogs"])
                    sel = "#content" if pg.locator("#content").count() else "body"
                    report["pages"][label] = {"reachable": ok, "text": "" if label in VOLATILE else norm(pg.inner_text(sel)),
                                              "http": sorted(set(cur["http"])), "rpc": sorted(set(cur["rpc"])),
                                              "console": sorted(set(cur["console"]))}
                    if a.shots:
                        pg.screenshot(path="%s/%s.png" % (a.shots, label))
        finally:
            # The CCU allows only a few concurrent sessions: always log out.
            try:
                if not click(pg, "div:text-is('Logout')"):
                    pg.goto(a.base + "/logout.htm")
                settle(pg, 500)
            except Exception:
                pass
            browser.close()

    json.dump(report, open(a.out, "w"), indent=1, sort_keys=True)
    bad = [k for k, v in report["pages"].items() if v["http"] or v["rpc"] or v["console"] or not v["reachable"]]
    print("logged_in=%s pages=%d with-problems=%d %s" % (report.get("logged_in"), len(report["pages"]), len(bad), bad))
    return 0 if report.get("logged_in") else 1


if __name__ == "__main__":
    sys.exit(main())
