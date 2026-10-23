import sys; sys.path.insert(0,sys.argv[3])
from common import *
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b,pg,errs=setup(p,sys.argv[1])
    keys=pg.evaluate("""()=>Array.from(document.querySelectorAll('#home-view a.tile')).map(a=>a.getAttribute('href').slice(1))""")
    missing=[]; visited=[]
    for m in keys:
        go(pg,m,120)
        items=pg.evaluate("()=>Array.from(document.querySelectorAll('#side-nav a[href^=\"#\"], #side-menu a.side-add, #side-menu [href^=\"#\"]')).map(a=>a.getAttribute('href').slice(1))")
        for h in sorted(set(items)):
            if '.' not in h: continue
            go(pg,h,60); visited.append(h)
            if pg.is_visible("#page-ph"): missing.append(h)
    print("modules:", keys, "missing:", missing); print("visited", len(visited)); print("errors:", errs); b.close()
