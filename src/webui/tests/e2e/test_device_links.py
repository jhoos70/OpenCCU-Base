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

        # 3. Click Tab 3: Direktverknüpfungen
        tab_links = page.locator("button:has-text('Direktverknüpfungen'), button:has-text('Direct Links')")
        tab_links.click()
        page.wait_for_selector("h3:has-text('Direktverknüpfungen'), h3:has-text('Direct Links')")
        print("PASS  Tab 3 (Direktverknüpfungen) loaded")

        # 4. Check "Neue Direktverknüpfung" button
        create_btn = page.locator("button:has-text('Neue Direktverknüpfung'), button:has-text('New direct link')").first
        assert create_btn.is_visible(), "Create link button should be visible for ADMIN"
        print("PASS  Create direct link button is visible")

        # 5. Open Create Link dialog
        create_btn.click()
        page.wait_for_selector("#create-sender")
        print("PASS  Create direct link modal opened")

        # 6. Verify channel options
        sender_opts = page.locator("#create-sender option")
        receiver_opts = page.locator("#create-receiver option")
        assert sender_opts.count() > 0, "Sender options should be populated"
        assert receiver_opts.count() > 0, "Receiver options should be populated with same interface channels"
        print(f"PASS  Options populated: {sender_opts.count()} senders, {receiver_opts.count()} receivers")

        # 7. Close dialog via cancel
        page.locator("button:has-text('Abbrechen'), button:has-text('Cancel')").first.click()
        page.wait_for_selector("#create-sender", state="hidden")
        print("PASS  Create link modal closed cleanly")

        print("PASS  All direct links e2e checks passed successfully!")

if __name__ == "__main__":
    main()
