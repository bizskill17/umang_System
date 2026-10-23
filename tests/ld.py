import sys; sys.path.insert(0,sys.argv[2])
from common import *
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b,pg,errs=setup(p,sys.argv[1])
    pg.evaluate("""async()=>{const d=U.db; const a=(p,o)=>d.collection(p).add(o); ['masters/customers/rows','leads','masters/users/rows'].forEach(U.watch); await new Promise(r=>setTimeout(r,100));
      const l=U.rows('leads')[0]; await a('recce',{no:'REC-26-27/1',lead_id:l.id,units:3,done:{completed:1},status:'In Progress',date:'2026-10-12',target:'2026-10-20',assigned_to:U.mrows('users')[0].id});
      await a('leads',{lead_no:'26-27/2',fy:'26-27',seq:2,customer_id:U.mrows('customers')[0].id,status:'In Progress',date:'2026-10-17'});}""")
    go(pg,"leads.in-progress",400)
    print("acts row1:", pg.eval_on_selector_all("#leads-live tbody tr:nth-child(1) .ico-act","e=>e.map(x=>x.title)"))
    print("acts row2:", pg.eval_on_selector_all("#leads-live tbody tr:nth-child(2) .ico-act","e=>e.map(x=>x.title)"))
    pg.click("#leads-live tbody tr:nth-child(2) td:nth-child(4)"); pg.wait_for_timeout(300)
    print("detail:", pg.inner_text("#ld-modal").replace("\n"," | ")[:900])
    pg.screenshot(path=sys.argv[2]+"/ld.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(100); print("closed:", pg.query_selector("#ld-modal") is None)
    pg.click('#leads-live tbody tr:nth-child(1) [data-act="q-asg"]'); pg.wait_for_timeout(100); pg.select_option("#um_assigned_to", index=1); pg.click('#u-mform button[type=submit]'); pg.wait_for_timeout(300)
    print("after asg:", pg.inner_text(".mv-note.ok"), pg.eval_on_selector_all("#leads-live tbody tr:nth-child(1) .ico-act","e=>e.map(x=>x.title)"))
    pg.click('#leads-live tbody tr:nth-child(1) [data-act="q-est"]'); pg.wait_for_timeout(100); pg.fill("#um_estimate","50000"); pg.click('#u-mform button[type=submit]'); pg.wait_for_timeout(300); print(pg.inner_text(".mv-note.ok"))
    pg.click('#leads-live tbody tr:nth-child(1) [data-act="assign-q"]'); pg.wait_for_timeout(150); print("fu outcome:", pg.input_value("#fu_status")); pg.keyboard.press("Escape")
    pg.click('#leads-live tbody tr:nth-child(1) [data-act="add-recce"]'); pg.wait_for_timeout(250); print("recce add:", pg.evaluate("location.hash"), pg.inner_text("#up_src-ss"))
    go(pg,"leads.in-progress",250); pg.click('#leads-live tbody tr:nth-child(2) .link-no'); pg.wait_for_timeout(200); pg.click('#ld-modal [data-act="fu"]'); pg.wait_for_timeout(200); print("fu from detail:", pg.is_visible("#fu-modal"))
    print(errs); b.close()
