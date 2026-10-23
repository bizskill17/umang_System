import sys; sys.path.insert(0,sys.argv[3])
from common import *
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b,pg,errs=setup(p,sys.argv[1],390)
    worst=[]
    for h in ["quotations.add","projects.add-job","projects.add","invoices.add","projects.assign-printing","quotations.prepare","invoices.invoice-master"]:
        go(pg,h,150); w=pg.evaluate("document.documentElement.scrollWidth"); worst.append((h,w))
    go(pg,"quotations.add",150); pg.screenshot(path=sys.argv[2]+"/q-phone.png", full_page=True)
    print(worst, errs); b.close()
