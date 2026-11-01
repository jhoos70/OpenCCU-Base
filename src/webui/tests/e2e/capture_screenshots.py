import os
import sys
import time
from playwright.sync_api import sync_playwright

OUT_DIR = "/home/standard/dev/OpenCCU-Base/docs/screenshots"

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # High resolution viewport (1440x900 or 1600x1000) with 1.5x device scale for crisp rendering
        context = browser.new_context(
            viewport={"width": 1440, "height": 920},
            device_scale_factor=1.5,
        )
        page = context.new_page()

        print("1. Signing in to NextGen WebUI...")
        page.goto("http://127.0.0.1:18090/webui/next/")
        page.wait_for_selector("#user")
        page.fill("#user", "AdminTest")
        page.fill("#password", "Admin")
        page.keyboard.press("Enter")
        page.wait_for_selector("[aria-label='Account menu'], [aria-label='Benutzermenü']")
        time.sleep(1)

        # 1. Overview Dashboard (Hero)
        print("2. Capturing Overview...")
        page.goto("http://127.0.0.1:18090/webui/next/#/overview")
        page.wait_for_selector("h1")
        time.sleep(1.5)
        page.screenshot(path=os.path.join(OUT_DIR, "01-overview.png"))

        # 2. Devices Table
        print("3. Capturing Devices Table...")
        page.goto("http://127.0.0.1:18090/webui/next/#/devices")
        page.wait_for_selector("table")
        time.sleep(1.5)
        page.screenshot(path=os.path.join(OUT_DIR, "02-devices-table.png"))

        # 3. Device Detail: Status & Control
        print("4. Capturing Device Detail (Status & Control)...")
        page.goto("http://127.0.0.1:18090/webui/next/#/devices/15852")
        page.wait_for_selector("h1")
        time.sleep(1.5)
        page.screenshot(path=os.path.join(OUT_DIR, "03-device-detail-status.png"))

        # 4. Device Detail: Hardware Parameters (MASTER)
        print("5. Capturing Device Parameters (MASTER)...")
        tab_params = page.locator("button:has-text('Parameter & Einstellungen'), button:has-text('Parameters & Settings')")
        tab_params.click()
        page.wait_for_selector("h3:has-text('MASTER')")
        time.sleep(1.5)
        page.screenshot(path=os.path.join(OUT_DIR, "04-device-parameters.png"))

        # 5. Device Detail: Direct Links
        print("6. Capturing Device Direct Links...")
        tab_links = page.locator("button:has-text('Direktverknüpfungen'), button:has-text('Direct Links')")
        tab_links.click()
        page.wait_for_selector("h3:has-text('Direktverknüpfungen'), h3:has-text('Direct Links')")
        time.sleep(1.5)
        page.screenshot(path=os.path.join(OUT_DIR, "05-device-direct-links.png"))

        # 6. Device Detail: Maintenance & Diagnostics
        print("7. Capturing Device Maintenance & Diagnostics...")
        tab_maint = page.locator("button:has-text('Wartung'), button:has-text('Maintenance')")
        tab_maint.click()
        page.wait_for_selector("h2:has-text('Gerätewartung und Diagnose'), h2:has-text('Device Maintenance & Diagnostics')")
        time.sleep(1.5)
        page.screenshot(path=os.path.join(OUT_DIR, "06-device-maintenance.png"))

        # 7. Heating Groups Overview Grid
        print("8. Capturing Heating Groups Overview...")
        page.goto("http://127.0.0.1:18090/webui/next/#/groups")
        page.wait_for_selector("h1:has-text('Heizgruppen'), h1:has-text('Heating Groups')")
        time.sleep(1.5)
        page.screenshot(path=os.path.join(OUT_DIR, "07-heating-groups-overview.png"))

        # 8. Heating Group Detail
        print("9. Capturing Heating Group Detail...")
        page.goto("http://127.0.0.1:18090/webui/next/#/groups/9")
        page.wait_for_selector("h1:has-text('Arbeitszimmer Bettina')")
        time.sleep(1.5)
        page.screenshot(path=os.path.join(OUT_DIR, "08-heating-group-detail.png"))

        # 9. Dark Mode Preview
        print("10. Capturing Dark Mode Preview...")
        # Toggle theme in user menu or html class
        page.evaluate("document.documentElement.classList.add('dark'); localStorage.setItem('openccu.next.theme', 'dark');")
        time.sleep(1)
        page.goto("http://127.0.0.1:18090/webui/next/#/overview")
        time.sleep(1.5)
        page.screenshot(path=os.path.join(OUT_DIR, "09-dark-mode-overview.png"))

        print(f"PASS  All 9 high-res screenshots captured to: {OUT_DIR}")

if __name__ == "__main__":
    main()
