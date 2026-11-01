import json
import re
import sys
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        
        # 1. Sign in to ccu-webui-test
        page.goto("http://127.0.0.1:18080/webui/next/")
        page.wait_for_selector("#user")
        page.fill("#user", "Admin")
        page.fill("#password", "Admin")
        page.keyboard.press("Enter")
        page.wait_for_selector("[aria-label='Account menu'], [aria-label='Benutzermenü']")
        print("PASS  Signed in successfully")

        # 2. Check search button in header
        search_btn = page.locator("header button[aria-label='Search'], header button[aria-label='Suchen']")
        assert search_btn.is_visible(), "Search button should be visible in header"
        print("PASS  Search button visible in AppBar")

        # 3. Test keyboard shortcut Ctrl+K
        page.keyboard.press("Control+k")
        page.wait_for_selector("[cmdk-input-wrapper]")
        input_el = page.locator("[cmdk-input-wrapper] input")
        assert input_el.is_visible(), "Command input should be visible"
        print("PASS  Ctrl+K opened command palette")

        # 4. Type search query: "Geräte" or "Devices"
        input_el.fill("Dev")
        page.wait_for_timeout(200)
        item = page.locator("[cmdk-item]").first
        assert item.is_visible(), "Filtered items should appear"
        print(f"PASS  Command palette filtered results: {item.inner_text()}")

        # 5. Press Escape to close
        page.keyboard.press("Escape")
        page.wait_for_selector("[cmdk-input-wrapper]", state="hidden")
        print("PASS  Escape closed command palette")

        # 6. Click search button in AppBar
        search_btn.click()
        page.wait_for_selector("[cmdk-input-wrapper]")
        print("PASS  Clicking AppBar search button opened palette")

        # 7. Select Theme -> Dark via command palette
        input_el = page.locator("[cmdk-input-wrapper] input")
        input_el.fill("Dark")
        page.wait_for_timeout(200)
        dark_item = page.locator("[cmdk-item]", has_text=re.compile(r"Dark|Dunkel")).first
        dark_item.click()
        page.wait_for_selector("[cmdk-input-wrapper]", state="hidden")
        
        # Verify dark class on html
        is_dark = page.evaluate("() => document.documentElement.classList.contains('dark')")
        assert is_dark, "Dark class should be present on documentElement"
        print("PASS  Command palette switched theme to dark")

        # 8. Test on mobile viewport (375x667)
        page.set_viewport_size({"width": 375, "height": 667})
        page.wait_for_timeout(200)
        
        # Check no horizontal overflow
        sw = page.evaluate("document.scrollingElement.scrollWidth")
        cw = page.evaluate("document.scrollingElement.clientWidth")
        assert sw <= cw, f"Horizontal overflow on mobile: scrollWidth={sw}, clientWidth={cw}"
        print(f"PASS  No horizontal scroll on mobile (sw={sw}, cw={cw})")

        # Open command palette on mobile
        mobile_search_btn = page.locator("header button[aria-label='Search'], header button[aria-label='Suchen']")
        assert mobile_search_btn.is_visible(), "Mobile search button should be visible"
        mobile_search_btn.click()
        page.wait_for_selector("[cmdk-input-wrapper]")
        print("PASS  Mobile search button opened palette")

        # Check modal width does not overflow on 375px
        modal_w = page.locator("[cmdk-input-wrapper]").evaluate("el => el.getBoundingClientRect().width")
        assert modal_w < 375, f"Modal width too large on mobile: {modal_w}"
        print(f"PASS  Command palette dialog fits mobile viewport ({modal_w}px < 375px)")

        # Escape to close
        page.keyboard.press("Escape")
        page.wait_for_selector("[cmdk-input-wrapper]", state="hidden")

        # 9. Test direct device navigation via URL
        page.set_viewport_size({"width": 1280, "height": 800})
        # Navigate to a non-existent device to test not-found state and back button
        page.goto("http://127.0.0.1:18080/webui/next/#/devices/nonexistent-999")
        page.wait_for_selector("a[href='#/devices']")
        back_btn = page.locator("a[href='#/devices']", has_text=re.compile(r"Back|Zurück"))
        assert back_btn.is_visible(), "Back to devices button should be visible in detail view"
        print("PASS  Device detail view renders with Back button")
        back_btn.click()
        page.wait_for_url("**/webui/next/#/devices")
        print("PASS  Back button returned to devices list")

        # 10. Test Room search and navigation in Command Palette
        page.route("**/v2/model?sections=rooms*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"rooms": {"total": 1, "offset": 0, "limit": 500, "items": [{"id": "r100", "name": "Wohnzimmer", "description": "", "channelIds": ["1", "2"]}]}})))
        page.keyboard.press("Control+k")
        page.wait_for_selector("[cmdk-input-wrapper]")
        input_el = page.locator("[cmdk-input-wrapper] input")
        input_el.fill("Wohnzimmer")
        page.wait_for_timeout(300)
        room_item = page.locator("[cmdk-item]", has_text="Wohnzimmer").first
        assert room_item.is_visible(), "Room search item should be visible"
        print("PASS  Room found in command palette")
        room_item.click()
        page.wait_for_url("**/webui/next/#/rooms/r100")
        print("PASS  Selecting room navigated to #/rooms/r100")

        browser.close()
        print("ALL COMMAND PALETTE TESTS PASSED!")

if __name__ == "__main__":
    main()
