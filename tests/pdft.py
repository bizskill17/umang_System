import sys, base64; sys.path.insert(0,sys.argv[2])
from common import *
from playwright.sync_api import sync_playwright
logo=base64.b64encode(open(sys.argv[2]+"/logo.png","rb").read()).decode()
with sync_playwright() as p:
    b,pg,errs=setup(p,sys.argv[1])
    pg.evaluate("""(b64)=>{const raw=atob(b64),u=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)u[i]=raw.charCodeAt(i);const of=window.fetch;window.fetch=(url,o)=>String(url).includes('_blob')?Promise.resolve(new Response(u,{headers:{'content-type':'image/png'}})):of(url,o);}""", logo)
    go(pg,"masters.m-firm",300)
    pg.click('#master-view [data-act="edit"]'); pg.wait_for_timeout(150)
    pg.set_input_files("#mf-logo", files=[{"name":"logo.png","mimeType":"image/png","buffer":open(sys.argv[2]+"/logo.png","rb").read()}])
    pg.fill("#mf-contact","Phone: 98765 43210\nEmail: info@umang.in"); pg.click('#mv-form button[type=submit]'); pg.wait_for_timeout(400)
    print("firm row:", pg.inner_html("#master-view tbody tr td:nth-child(2)")[:120])
    go(pg,"quotations.prepare",300); pg.click('[data-a="q-prepare"]'); pg.wait_for_timeout(300)
    for i in range(3):
        if i: pg.click('[data-a="q-add-row"]'); pg.wait_for_timeout(120)
        pg.select_option(f"#qi_item_id_{i}", index=1+(i%2)); pg.fill(f"#qi_description_{i}", "Front fascia board with LED backlit letters, size as per site" if i==0 else "Item "+str(i))
        if i==0: pg.fill(f"#qi_width_{i}","10"); pg.fill(f"#qi_height_{i}","3"); pg.select_option(f"#qi_uom_{i}","Foot")
        else: pg.select_option(f"#qi_uom_{i}","Nos")
        pg.fill(f"#qi_qty_{i}",str(2+i)); pg.fill(f"#qi_rate_{i}","150"); pg.select_option(f"#qi_gst_pct_{i}","18")
    pg.fill("#qt_round_off","0.5")
    pg.click('#u-pform button[type=submit]'); pg.wait_for_timeout(400)
    pg.click('[data-a="q-view"]'); pg.wait_for_timeout(200); pg.click('#u-modal [data-qpdf]'); pg.wait_for_timeout(1500)
    data=pg.evaluate("Array.from(window.__saved.data)"); open(sys.argv[2]+"/q2.pdf","wb").write(bytes(data))
    print(errs); b.close()
