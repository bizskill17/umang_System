import sys
from playwright.sync_api import sync_playwright
src, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(); errs=[]
    pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + src + "#quotations.checking"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{out}/m-desktop.png")
    for h in ["leads.sending","recce","design.client-approval","projects.master","home"]:
        pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(100)
        print(h, pg.inner_text("#page-title") if h!="home" else pg.is_visible("#home-view"))
    ph = b.new_page(viewport={"width": 390, "height": 844}); ph.on("pageerror", lambda e: errs.append(str(e)))
    ph.goto("file://" + src + "#recce.pending-ppt"); ph.wait_for_timeout(300)
    ph.click("#menu-open"); ph.wait_for_timeout(400)
    ph.screenshot(path=f"{out}/m-phone-menu.png")
    print("scrollW", ph.evaluate("document.documentElement.scrollWidth"), "errors", errs)
    b.close()
