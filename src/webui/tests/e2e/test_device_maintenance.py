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

        # 3. Click Tab 4: Wartung / Maintenance
        tab_maintenance = page.locator("button:has-text('Wartung'), button:has-text('Maintenance')")
        tab_maintenance.click()
        page.wait_for_selector("h2:has-text('Gerätewartung und Diagnose'), h2:has-text('Device Maintenance & Diagnostics')")
        print("PASS  Tab 4 (Wartung) loaded")

        # 4. Check "Status & Verbindung prüfen" button
        refresh_btn = page.locator("button:has-text('Status & Verbindung prüfen'), button:has-text('Check status & connection')").first
        assert refresh_btn.is_visible(), "Refresh status button should be visible"
        print("PASS  Status refresh button is visible")

        # 5. Check Diagnostics & Signal Quality section
        assert page.locator("h3:has-text('Verbindung & Signalstärke'), h3:has-text('Connection & Signal Quality')").is_visible()
        print("PASS  Diagnostics and connection status section visible")

        # 6. Check Firmware section
        assert page.locator("h3:has-text('Geräte-Firmware'), h3:has-text('Device Firmware')").is_visible()
        print("PASS  Firmware section visible")

        # 7. Check Device Replacement section & modal
        replace_btn = page.locator("button:has-text('Gerät ersetzen...'), button:has-text('Replace device...')").first
        assert replace_btn.is_visible(), "Device replacement button should be visible"
        replace_btn.click()
        page.wait_for_selector("h3:has-text('Gerätetausch durchführen'), h3:has-text('Replace Device')")
        print("PASS  Device replacement modal opened")
        page.locator("button:has-text('Abbrechen'), button:has-text('Cancel')").first.click()
        print("PASS  Device replacement modal closed")

        # 8. Check Danger Zone: Unpair & Delete section & modal
        delete_btn = page.locator("button:has-text('Gerät ablernen / löschen...'), button:has-text('Unpair / Delete device...')").first
        assert delete_btn.is_visible(), "Unpair & Delete button should be visible"
        delete_btn.click()
        page.wait_for_selector("h3:has-text('Gerät ablernen und löschen'), h3:has-text('Unpair & Delete Device')")
        print("PASS  Unpair & Delete modal opened")

        # 9. Verify 3 deletion options exist
        radio_options = page.locator("input[name='delete-flag']")
        assert radio_options.count() == 3, f"Expected 3 deletion options, found {radio_options.count()}"
        print("PASS  All 3 unpair/reset options present")

        # 10. Check confirmation checkbox requirement
        confirm_btn = page.locator("button:has-text('Endgültig ablernen und löschen'), button:has-text('Permanently delete device')").first
        assert confirm_btn.is_disabled(), "Delete button must be disabled until confirmation checkbox is checked"
        print("PASS  Delete button safely disabled initially")

        page.locator("button:has-text('Abbrechen'), button:has-text('Cancel')").first.click()
        print("PASS  Unpair & Delete modal closed cleanly")

        print("PASS  All maintenance e2e checks passed successfully!")

if __name__ == "__main__":
    main()
