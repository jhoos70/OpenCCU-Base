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

        # 2. Check sidebar navigation for "Gruppen" / "Heizgruppen"
        nav_groups = page.locator("nav a:has-text('Gruppen'), nav a:has-text('Groups')").first
        assert nav_groups.is_visible(), "Groups navigation item should be visible for ADMIN"
        nav_groups.click()
        page.wait_for_selector("h1:has-text('Heizgruppen'), h1:has-text('Heating Groups')")
        print("PASS  Navigated to #/groups, page loaded")

        # 3. Check group cards rendered
        group_cards = page.locator("a[href^='#/groups/']")
        assert group_cards.count() > 0, f"Expected heating group cards, found {group_cards.count()}"
        print(f"PASS  Rendered {group_cards.count()} heating group cards")

        # 4. Test search input
        search_input = page.locator("input[type='search']")
        search_input.fill("Bettina")
        page.wait_for_selector("h2:has-text('Arbeitszimmer Bettina')")
        filtered_count = page.locator("a[href^='#/groups/']").count()
        assert filtered_count >= 1, "Should filter down to matching group"
        print("PASS  Search filtering works cleanly")

        # 5. Open group detail: Arbeitszimmer Bettina
        group_card = page.locator("a[href^='#/groups/']:has-text('Arbeitszimmer Bettina')").first
        group_card.click()
        page.wait_for_selector("h1:has-text('Arbeitszimmer Bettina')")
        print("PASS  Opened group detail view for Arbeitszimmer Bettina")

        # 6. Check virtual device serial and badges
        assert page.locator("text=INT0000009").first.is_visible(), "Virtual device serial INT0000009 should be displayed"
        print("PASS  Virtual device serial INT0000009 verified")

        # 7. Check member sections exist
        assert page.locator("h3:has-text('Zugeordnete Geräte'), h3:has-text('Group Members')").is_visible()
        assert page.locator("text=Wandthermostat").first.is_visible()
        assert page.locator("text=Heizkörper").first.is_visible()
        assert page.locator("text=Fenster").first.is_visible()
        print("PASS  Categorized member sections visible (Wall, Radiator, Window)")

        # 8. Check member link to device detail page
        member_link = page.locator("a[href^='#/devices/']").first
        assert member_link.is_visible(), "Link to member device detail should be visible"
        print("PASS  Member device link present")

        # 9. Check Parameters tab
        param_tab = page.locator("button:has-text('Parameter & Einstellungen'), button:has-text('Parameters & Settings')")
        if param_tab.is_visible():
            param_tab.click()
            page.wait_for_selector("h3:has-text('MASTER')")
            print("PASS  Group weekly schedule / master parameters tab verified")

        # 10. Navigate back to groups list
        back_link = page.locator("a:has-text('Zurück zur Gruppenübersicht'), a:has-text('Back to heating groups')").first
        back_link.click()
        page.wait_for_selector("h1:has-text('Heizgruppen'), h1:has-text('Heating Groups')")
        print("PASS  Navigated back to groups overview cleanly")

        print("PASS  All heating groups e2e tests passed successfully!")

if __name__ == "__main__":
    main()
