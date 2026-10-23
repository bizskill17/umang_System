import sys
from playwright.sync_api import sync_playwright
src, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(); errs=[]
    ph = b.new_page(viewport={"width": 390, "height": 844}); ph.on("pageerror", lambda e: errs.append(str(e)))
    ph.goto("file://" + src + "#leads.checking"); ph.wait_for_timeout(300)
    ph.click(".login-btn"); ph.wait_for_timeout(100)
    print("errors shown:", ph.inner_text("#login-email-err"), "|", ph.inner_text("#login-password-err"))
    ph.screenshot(path=f"{out}/login-phone.png", full_page=True)
    ph.fill("#login-email","pk.jain@umang.in"); ph.fill("#login-password","x"); ph.click(".login-btn"); ph.wait_for_timeout(200)
    print("after:", ph.inner_text("#page-title"), "|", ph.inner_text(".side-user-name"))
    ph.click("#menu-open"); ph.wait_for_timeout(300); ph.click('.side-user [aria-label="Log out"]'); ph.wait_for_timeout(200)
    print("logged out shows login:", ph.is_visible("#login-view"), "scrollW", ph.evaluate("document.documentElement.scrollWidth"), "pageerrors", errs)
    b.close()
