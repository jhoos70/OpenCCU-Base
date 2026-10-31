#!/usr/bin/env python3
"""Browser test of the nextGen login (/webui/next/) against a CCU with v2_enabled.

    python3 next_login.py --base http://127.0.0.1:18080 --user Admin --password Admin

Checks: a wrong password shows a message and no session; a correct login shows the signed-in view;
the session survives a reload; the same session opens the classic UI; sign out ends it. It always
signs out, because the CCU limits concurrent sessions.
"""
import argparse, re, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon")


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

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page()
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and console.append(m.text[:140]))
        signed_in = False
        try:
            pg.goto(a.base + "/webui/next/")
            pg.wait_for_selector("#user")
            check("login form is shown", pg.get_by_text("Sign in").first.is_visible())

            pg.fill("#user", a.user); pg.fill("#password", a.password + "-wrong"); pg.keyboard.press("Enter")
            pg.wait_for_selector("[role=alert]")
            check("wrong password shows a message", "Invalid user name or password" in pg.inner_text("[role=alert]"), repr(pg.inner_text("[role=alert]")))
            check("wrong password leaves no session", pg.evaluate("sessionStorage.length") == 0)
            del console[:]  # the browser logs the deliberate 401 as an error; only count what follows

            pg.fill("#password", a.password); pg.keyboard.press("Enter")
            pg.get_by_text("Signed in").wait_for()
            signed_in = True
            check("login shows the signed-in view", a.user in pg.inner_text("main"))
            sid = pg.evaluate("JSON.parse(sessionStorage.getItem('openccu.next.session')).sid")
            check("session id has the CCU format", bool(re.fullmatch(r"[A-Za-z0-9]{10}", sid)), sid[:2] + "…")

            pg.reload(); pg.get_by_text("Signed in").wait_for()
            check("session survives a reload", True)

            pg.get_by_text("Open the classic UI").click()
            pg.wait_for_url(re.compile(r"/pages/index\.htm"))
            pg.wait_for_selector("#menubar", timeout=20000)
            check("classic UI opens with the same session", "/login.htm" not in pg.url and pg.locator("#menubar").is_visible(), pg.url.replace(sid, "SID"))

            pg.goto(a.base + "/webui/next/"); pg.get_by_text("Signed in").wait_for()
            pg.get_by_role("button", name="Sign out").click()
            pg.wait_for_selector("#user")
            signed_in = False
            check("sign out returns to the form", pg.evaluate("sessionStorage.length") == 0)
            check("no console errors", not console, str(console))
            del console[:]

            pg.goto(a.base + "/pages/index.htm?sid=@%s@" % sid)
            pg.wait_for_load_state("networkidle")
            check("the session is invalid after sign out", pg.locator("#menubar").count() == 0, pg.url.replace(sid, "SID"))
        finally:
            if signed_in:
                try:
                    pg.goto(a.base + "/webui/next/"); pg.get_by_role("button", name="Sign out").click(timeout=5000)
                except Exception:
                    pass
            browser.close()
    print("\n%d PASS, %d FAIL" % (results.count(True), results.count(False)))
    return 1 if False in results else 0


if __name__ == "__main__":
    sys.exit(main())
