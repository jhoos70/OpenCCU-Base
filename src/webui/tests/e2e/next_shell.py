#!/usr/bin/env python3
"""Browser test of the nextGen shell (app bar, sidebar, drawer, user menu, user levels).

    python3 next_shell.py --base http://127.0.0.1:18080 --user Admin --password Admin

Real: the admin of the test CCU (level, mode, nav). Mocked /profile answers cover the other levels, an unknown
level, a failing profile and an expired session, which the test CCU cannot produce. Always signs out.
"""
import argparse, json, sys
from playwright.sync_api import sync_playwright

NOISE = ("Synchronous XMLHttpRequest", "Synchrone XMLHttpRequest", "file:///", "favicon")
PROFILE = {"userId": "1004", "userName": "Admin", "firstName": "Max", "hasPassword": True, "isNoExpert": False, "language": "", "level": "ADMIN"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--user", default="Admin")
    ap.add_argument("--password", required=True)
    a = ap.parse_args()
    results = []

    def check(name, ok, detail=""):
        results.append(ok)
        print("%s  %s %s" % ("PASS" if ok else "FAIL", name, detail))

    def sign_in(pg):
        pg.goto(a.base + "/webui/next/"); pg.wait_for_selector("#user")
        pg.fill("#user", a.user); pg.fill("#password", a.password); pg.keyboard.press("Enter")
        pg.wait_for_selector("[aria-label='Account menu'], [role=alert]")
        if pg.get_by_role("alert").count():
            raise RuntimeError("sign-in failed: " + pg.get_by_role("alert").inner_text())
        wait_nav(pg)

    def wait_nav(pg):
        # the nav (or a final message) follows once the profile has loaded
        pg.wait_for_function("() => document.querySelector('aside nav a') || [...document.querySelectorAll('main p')].some(p => !/Loading|Lädt/.test(p.innerText))")

    def sign_out(pg):
        pg.get_by_role("button", name="Account menu").click(); pg.get_by_role("menuitem", name="Sign out").click(); pg.wait_for_selector("#user")

    def mock_profile(pg, status=200, **fields):
        body = {**PROFILE, **fields}
        pg.route("**/v2/profile", lambda r: r.fulfill(status=status, content_type="application/json", body=json.dumps(body if status == 200 else {"error": {"code": 400, "message": "x"}})))

    def links(pg):
        return [t.strip() for t in pg.locator("aside nav a").all_inner_texts()]

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1100, "height": 800})
        pg = ctx.new_page()
        console, sids = [], []

        def on_response(r):  # every session this test creates is ended at the end, whatever happens in between
            try:
                if r.request.method == "POST" and '"Session.login"' in (r.request.post_data or "") and r.ok:
                    sid = r.json().get("result")
                    if isinstance(sid, str):
                        sids.append(sid)
            except Exception:
                pass

        pg.on("response", on_response)
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and console.append(m.text[:140]))
        try:
            # ---- desktop, real admin
            sign_in(pg)
            groups = [h.strip().lower() for h in pg.locator("aside nav h2").all_inner_texts()]
            check("the sidebar groups the entries", groups == ["objects"], str(groups))
            check("the sidebar lists the built objects", links(pg) == ["Overview", "Devices", "Rooms", "Programs", "System variables", "More in the classic UI"], str(links(pg)))
            check("the current page is marked", pg.locator("aside nav a[aria-current=page]").inner_text() == "Overview")
            check("the menu button is hidden on a wide screen", not pg.get_by_role("button", name="Menu", exact=True).is_visible())
            check("the classic link carries the session", "/pages/index.htm?sid=@" in pg.locator("aside nav a", has_text="More in the classic UI").get_attribute("href"))

            pg.get_by_role("button", name="Account menu").click()
            menu = pg.get_by_role("menu").inner_text()
            check("the user menu shows name, level and mode", "Administrator" in menu and ("Simple mode" in menu or "Expert mode" in menu), menu.replace("\n", " | ")[:120])
            check("the user menu offers languages, the classic UI and sign out", all(x in menu for x in ("Deutsch", "English", "Open the classic UI", "Sign out")))
            pg.keyboard.press("Escape")
            check("Escape closes the user menu", pg.get_by_role("menu").count() == 0)

            # ---- narrow screen: drawer
            pg.set_viewport_size({"width": 375, "height": 740})
            check("narrow: the sidebar is hidden", not pg.locator("aside").is_visible())
            pg.get_by_role("button", name="Menu", exact=True).click()
            drawer = pg.get_by_role("dialog")
            check("narrow: the menu button opens a drawer with the same entries", [t.strip() for t in drawer.locator("nav li a").all_inner_texts()] == ["Overview", "Devices", "Rooms", "Programs", "System variables"])
            drawer.get_by_role("link", name="Rooms").click(); pg.wait_for_selector("h1:text('Rooms')")
            check("narrow: choosing an entry navigates and closes the drawer", "#/rooms" in pg.url and pg.get_by_role("dialog").count() == 0)
            pg.get_by_role("button", name="Menu", exact=True).click(); pg.keyboard.press("Escape")
            check("narrow: Escape closes the drawer", pg.get_by_role("dialog").count() == 0)
            check("narrow: no sideways page scroll", not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
            check("no console errors", not console, str(console))
            pg.set_viewport_size({"width": 1100, "height": 800})

            # ---- other levels: the same session, a mocked profile (a reload loads the page again; the v2 login is rate limited)
            def with_profile(**kw):
                pg.unroute("**/v2/profile"); mock_profile(pg, **kw); pg.reload(); wait_nav(pg)

            with_profile(level="USER")
            check("a user sees the entries of the user menu of the classic UI", links(pg) == ["Overview", "Devices", "Rooms", "Programs", "System variables", "More in the classic UI"], str(links(pg)))
            pg.get_by_role("button", name="Account menu").click()
            check("the user menu names the level", "User" in pg.get_by_role("menu").inner_text())
            pg.keyboard.press("Escape")

            with_profile(level="GUEST")
            check("a guest gets no navigation, as in the classic UI", pg.locator("aside").count() == 0 and pg.get_by_role("button", name="Menu", exact=True).count() == 0)
            check("a guest is told why", pg.get_by_text("Your account has no pages in the new UI yet.").is_visible())

            with_profile(level="SUPERUSER")
            check("an unknown level gets no rights", pg.locator("aside").count() == 0 and pg.get_by_text("no pages").is_visible())

            pg.unroute("**/v2/profile")
            pg.route("**/v2/profile", lambda r: r.fulfill(status=500, content_type="application/json", body='{"error":{"code":500,"message":"secret internals"}}'))
            pg.reload(); pg.get_by_role("alert").wait_for()
            alert = pg.get_by_role("alert").inner_text()
            check("a failing profile shows a message without internals", "secret" not in alert and "refused" in alert, alert)
            check("a failing profile still allows signing out", pg.get_by_role("button", name="Account menu").is_visible())

            # the admin again, then the way out through the menu
            pg.unroute("**/v2/profile"); pg.reload(); wait_nav(pg)
            check("the real profile restores the navigation", links(pg)[:5] == ["Overview", "Devices", "Rooms", "Programs", "System variables"])
            sign_out(pg)

            # ---- an expired session returns to the form (the real session is ended in the cleanup below)
            sign_in(pg)
            pg.unroute("**/v2/profile"); mock_profile(pg, status=401); pg.reload()
            pg.wait_for_selector("#user", timeout=10000)
            check("an expired session returns to the sign-in form", pg.evaluate("sessionStorage.length") == 0)
        finally:
            for sid in sids:
                try:
                    pg.request.post(a.base + "/api/homematic.cgi/v2/rpc", headers={"Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", "X-Session-Id": sid},
                                    data=json.dumps({"version": "1.1", "method": "Session.logout", "params": {}, "id": 1}))
                except Exception:
                    pass
            browser.close()
    print("\n%d PASS, %d FAIL" % (results.count(True), results.count(False)))
    return 1 if False in results else 0


if __name__ == "__main__":
    sys.exit(main())
