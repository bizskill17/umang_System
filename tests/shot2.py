import sys
from playwright.sync_api import sync_playwright
src, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + src + "#leads.pending-assignee"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{out}/leads-desktop.png")
    ph = b.new_page(viewport={"width": 390, "height": 844})
    ph.on("pageerror", lambda e: errs.append(str(e)))
    ph.goto("file://" + src + "#leads.checking"); ph.wait_for_timeout(300)
    ph.screenshot(path=f"{out}/leads-phone.png")
    ph.click("#menu-open"); ph.wait_for_timeout(400)
    ph.screenshot(path=f"{out}/leads-phone-menu.png")
    print("scrollW", ph.evaluate("document.documentElement.scrollWidth"), "errors", errs)
    b.close()
