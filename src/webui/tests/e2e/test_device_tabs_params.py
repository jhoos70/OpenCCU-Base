import sys
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        # 1. Sign in to ccu-real-copy with AdminTest / Admin
        page.goto("http://127.0.0.1:18090/webui/next/")
        page.wait_for_selector("#user")
        page.fill("#user", "AdminTest")
        page.fill("#password", "Admin")
        page.keyboard.press("Enter")
        page.wait_for_selector("[aria-label='Account menu'], [aria-label='Benutzermenü']")
        print("PASS  Signed in successfully to ccu-real-copy")

        # 2. Navigate to device 15852
        page.goto("http://127.0.0.1:18090/webui/next/#/devices/15852")
        page.wait_for_selector("h1")
        print("PASS  Loaded device page")

        # 3. Check tabs exist
        tab_status = page.locator("button:has-text('Status & Bedienung'), button:has-text('Status & Control')")
        tab_params = page.locator("button:has-text('Parameter & Einstellungen'), button:has-text('Parameters & Settings')")
        tab_links = page.locator("button:has-text('Direktverknüpfungen'), button:has-text('Direct Links')")
        tab_maint = page.locator("button:has-text('Wartung'), button:has-text('Maintenance')")

        assert tab_status.is_visible(), "Status tab should be visible"
        assert tab_params.is_visible(), "Parameters tab should be visible"
        assert tab_links.is_visible(), "Links tab should be visible"
        assert tab_maint.is_visible(), "Maintenance tab should be visible"
        print("PASS  All 4 device tabs are visible")

        # 4. Check Tab 1: Status & Control is active by default
        assert page.locator("h2:has-text('Kanäle'), h2:has-text('Channels')").is_visible()
        print("PASS  Tab 1 (Status & Control) is active by default")

        # 5. Click Tab 2: Parameter & Einstellungen
        tab_params.click()
        page.wait_for_selector("h3:has-text('MASTER')")
        print("PASS  Tab 2 (Parameter & Einstellungen) loaded")

        # 6. Check battery hint banner is present
        hint = page.locator("text=Bei batteriebetriebenen Geräten")
        assert hint.is_visible(), "Battery wakeup hint should be visible"
        print("PASS  Battery wakeup notice banner is visible")

        # 7. Check target selector exists (Gerät Basis / Kanäle)
        target_btn = page.locator("button:has-text('Gerät (Allgemein)'), button:has-text('Device (General)')")
        assert target_btn.is_visible(), "Target selector button should be visible"
        print("PASS  Target selector pills visible")

        # 8. Check Tab 3: Direktverknüpfungen placeholder
        tab_links.click()
        page.wait_for_selector("text=Direktverknüpfungen dieses Geräts")
        print("PASS  Tab 3 (Direktverknüpfungen) loaded with placeholder")

        # 9. Check Tab 4: Wartung placeholder
        tab_maint.click()
        page.wait_for_selector("text=Geräte-Firmware-Updates (OTA)")
        print("PASS  Tab 4 (Wartung) loaded with placeholder")

        # 10. Switch back to Tab 1
        tab_status.click()
        page.wait_for_selector("h2:has-text('Kanäle'), h2:has-text('Channels')")
        print("PASS  Switched back to Tab 1 seamlessly")

        print("PASS  All device tabs & parameters e2e tests passed successfully!")

if __name__ == "__main__":
    main()
