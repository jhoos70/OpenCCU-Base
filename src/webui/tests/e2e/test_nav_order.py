import sys
import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        print("1. Logging in...")
        page.goto("http://127.0.0.1:18090/webui/next/")
        page.wait_for_selector("#user")
        page.fill("#user", "AdminTest")
        page.fill("#password", "Admin")
        page.keyboard.press("Enter")
        page.wait_for_selector("[aria-label='Account menu'], [aria-label='Benutzermenü']")
        time.sleep(1)

        # 2. Check initial default order in sidebar
        print("2. Checking default menu order in sidebar...")
        links = [a.inner_text().strip() for a in page.locator("aside nav a").all() if a.inner_text().strip()]
        print("Default nav links:", links)

        # Overview should be #1, followed by Favoriten, Räume, Geräte, Heizgruppen
        assert "Übersicht" in links[0] or "Overview" in links[0], f"Expected Overview first, got {links[0]}"
        assert "Favoriten" in links[1] or "Favourites" in links[1], f"Expected Favourites second, got {links[1]}"
        assert "Räume" in links[2] or "Rooms" in links[2], f"Expected Rooms third, got {links[2]}"
        assert "Geräte" in links[3] or "Devices" in links[3], f"Expected Devices fourth, got {links[3]}"
        assert "Heizgruppen" in links[4] or "Heating groups" in links[4] or "Gruppen" in links[4], f"Expected Heating groups fifth, got {links[4]}"

        # 3. Open Customize Menu dialog from sidebar
        print("3. Opening Customize Menu dialog...")
        customize_btn = page.locator("button[aria-label='Menü anpassen'], button[aria-label='Customize menu']")
        assert customize_btn.is_visible(), "Customize menu button not visible in sidebar!"
        customize_btn.click()

        page.wait_for_selector("role=dialog")
        print("Dialog opened successfully.")

        # 4. Test reordering: Move 'Geräte' up
        print("4. Moving Geräte up...")
        move_up_gerate = page.locator("button[aria-label*='Geräte'], button[aria-label*='Devices']").locator("xpath=..//button[contains(@aria-label, 'Nach oben') or contains(@aria-label, 'Move up')]")
        move_up_gerate.click()
        time.sleep(0.5)

        # Check localStorage updated
        storage_val = page.evaluate("() => localStorage.getItem('openccu.next.nav.custom')")
        print("localStorage value:", storage_val)
        assert storage_val is not None, "Nav custom order not saved in localStorage!"

        # Close dialog
        print("5. Closing dialog and checking updated sidebar...")
        done_btn = page.locator("role=dialog").get_by_role("button", name="Fertig")
        if done_btn.count() == 0:
            done_btn = page.locator("role=dialog").get_by_role("button", name="Done")
        done_btn.click()
        time.sleep(0.5)

        updated_links = [a.inner_text().strip() for a in page.locator("aside nav a").all() if a.inner_text().strip()]
        print("Updated nav links:", updated_links)
        # Geräte should now be before Räume (index 2 instead of index 3)
        assert ("Geräte" in updated_links[2] or "Devices" in updated_links[2]), f"Expected Geräte to be moved up to index 2, got {updated_links}"

        # 6. Re-open and reset to default
        print("6. Re-opening dialog and resetting to default...")
        customize_btn.click()
        page.wait_for_selector("role=dialog")
        reset_btn = page.locator("role=dialog").get_by_role("button", name="Auf Standard zurücksetzen")
        if reset_btn.count() == 0:
            reset_btn = page.locator("role=dialog").get_by_role("button", name="Reset to default")
        reset_btn.click()
        time.sleep(0.5)

        done_btn = page.locator("role=dialog").get_by_role("button", name="Fertig")
        if done_btn.count() == 0:
            done_btn = page.locator("role=dialog").get_by_role("button", name="Done")
        done_btn.click()
        time.sleep(0.5)

        restored_links = [a.inner_text().strip() for a in page.locator("aside nav a").all() if a.inner_text().strip()]
        print("Restored nav links:", restored_links)
        assert ("Räume" in restored_links[2] or "Rooms" in restored_links[2]), f"Expected Räume back at index 2, got {restored_links}"

        print("ALL NAV ORDER & CUSTOMIZATION TESTS PASSED!")
        browser.close()

if __name__ == "__main__":
    main()
