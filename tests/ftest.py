import sys; sys.path.insert(0,sys.argv[3])
from common import *
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b,pg,errs=setup(p,sys.argv[1])
    out=sys.argv[2]
    go(pg,"leads.in-progress"); print("leads panel hidden:", pg.is_hidden("#leads-live .mv-fpanel")); pg.screenshot(path=out+"/f-closed.png")
    pg.click("#leads-live .mv-ficon"); pg.wait_for_timeout(50); print("open:", pg.is_visible("#leads-live .mv-fpanel"))
    pg.select_option("#lf-owner", label="Sita Rao"); pg.wait_for_timeout(150)
    print("after filter still open:", pg.is_visible("#leads-live .mv-fpanel"), "badge:", pg.inner_text("#leads-live .mv-fbadge"))
    pg.screenshot(path=out+"/f-open.png")
    go(pg,"recce.master"); print("recce hidden:", pg.is_hidden("#mod-live .mv-fpanel")); pg.click("#mod-live .mv-ficon"); pg.fill("#uf-from","2026-10-01"); pg.wait_for_timeout(150)
    print("recce open after date:", pg.is_visible("#mod-live .mv-fpanel"), pg.inner_text("#mod-live .mv-fbadge"))
    pg.fill("#uf-q","zz"); pg.wait_for_timeout(100); print("search focus kept:", pg.evaluate("document.activeElement.id"))
    go(pg,"projects.m-items"); print("master bar:", pg.eval_on_selector("#master-view .mv-bar","e=>Array.from(e.children).map(c=>c.className)"))
    ph=b.new_page(viewport={"width":390,"height":844}); ph.goto("file://"+sys.argv[1]+"#leads.in-progress"); ph.fill("#login-email","a"); ph.fill("#login-password","x"); ph.click(".login-btn"); ph.wait_for_timeout(250)
    ph.click("#leads-live .mv-ficon"); ph.wait_for_timeout(50); print("phone sw:", ph.evaluate("document.documentElement.scrollWidth")); ph.screenshot(path=out+"/f-phone.png")
    print("errors:", errs); b.close()
