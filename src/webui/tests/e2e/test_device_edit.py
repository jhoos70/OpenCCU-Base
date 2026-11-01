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

        # 2. Navigate directly to device 15852
        page.goto("http://127.0.0.1:18090/webui/next/#/devices/15852")
        page.wait_for_selector("h1")
        orig_title = page.locator("h1").inner_text()
        print(f"PASS  Loaded device page: {orig_title}")

        # 3. Check "Gerät bearbeiten" / "Edit device" button
        edit_btn = page.locator("button:has-text('Gerät bearbeiten'), button:has-text('Edit device')")
        assert edit_btn.is_visible(), "Edit device button should be visible for ADMIN"
        print("PASS  Edit button is visible")

        # 4. Click "Gerät bearbeiten"
        edit_btn.click()
        page.wait_for_selector("#device-name-input")
        dev_name_val = page.locator("#device-name-input").input_value()
        print(f"PASS  Device edit drawer opened. Device name: {dev_name_val}")
        assert dev_name_val == orig_title

        # 5. Check channel fields
        ch_input = page.locator("input[id^='ch-name-']").first
        orig_ch_name = ch_input.input_value()
        print(f"PASS  Original channel name: {orig_ch_name}")

        # 6. Test actual mutation: change channel name to test name, and save
        test_ch_name = orig_ch_name + " TEST"
        ch_input.fill(test_ch_name)

        save_btn = page.locator("button:has-text('Änderungen speichern'), button:has-text('Save changes')")
        save_btn.click()
        page.wait_for_selector("#device-name-input", state="hidden")
        print("PASS  Saved changes, drawer closed")

        # 7. Check that technical table or channel details reflects the new name
        page.locator("summary:has-text('Technische Details')").click()
        page.wait_for_selector(f"text={test_ch_name}")
        print(f"PASS  Updated channel name visible on page: {test_ch_name}")

        # 8. Revert change back to orig_ch_name
        edit_btn.click()
        page.wait_for_selector("#device-name-input")
        ch_input = page.locator("input[id^='ch-name-']").first
        ch_input.fill(orig_ch_name)
        page.locator("button:has-text('Änderungen speichern'), button:has-text('Save changes')").click()
        page.wait_for_selector("#device-name-input", state="hidden")
        print(f"PASS  Reverted channel name back to: {orig_ch_name}")

        # 9. Verify reverted name in technical table
        page.wait_for_selector(f"text={orig_ch_name}")
        print("PASS  Reverted name confirmed on page")

        # 10. Check device table actions column on #/devices
        page.goto("http://127.0.0.1:18090/webui/next/#/devices")
        page.wait_for_selector("table")
        edit_action_btn = page.locator("table button[title='Gerät bearbeiten'], table button[title='Edit device']").first
        assert edit_action_btn.is_visible(), "Quick edit action button should be visible in table"
        print("PASS  Quick edit button is visible in device table row")

        # 11. Click quick edit button in table
        edit_action_btn.click()
        page.wait_for_selector("#device-name-input")
        table_dev_name = page.locator("#device-name-input").input_value()
        print(f"PASS  Quick edit drawer opened from table for device: {table_dev_name}")

        page.keyboard.press("Escape")
        page.wait_for_selector("#device-name-input", state="hidden")
        print("PASS  All end-to-end device editing & mutation checks passed successfully!")

if __name__ == "__main__":
    main()
