import sys
from playwright.sync_api import sync_playwright
src, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w, h in [("phone", 390, 844), ("tablet", 820, 1180), ("desktop", 1440, 900)]:
        pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
        pg.goto("file://" + src)
        pg.screenshot(path=f"{out}/home-{name}.png", full_page=True)
        print(name, pg.evaluate("document.documentElement.scrollWidth"), w)
    b.close()
