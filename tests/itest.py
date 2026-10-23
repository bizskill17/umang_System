import sys; sys.path.insert(0,sys.argv[3])
from common import *
from playwright.sync_api import sync_playwright
src,out=sys.argv[1],sys.argv[2]
with sync_playwright() as p:
    b,pg,errs=setup(p,src)
    pg.evaluate("""async()=>{const d=U.db; const a=(p,o)=>d.collection(p).add(o); ['masters/customers/rows'].forEach(U.watch); await new Promise(r=>setTimeout(r,80));
      const c=U.mrows('customers')[0];
      const pr=await a('projects',{no:'26-27/1',fy:'26-27',seq:1,customer_id:c.id,status:'In Progress',date:'2026-10-01',due:'2026-10-30'});
      const j=await a('jobs',{no:'26/27 - 1',fy:'26-27',seq:1,project_id:pr.id,customer_id:c.id,status:'Completed',items:[{lid:'L1',qty:2,steps:[],item_id:'',description:'Board'}]});
      await a('qc',{job_id:j.id,lid:'L1',passed:2,hold:0});
      await a('dispatches',{no:'DSP',project_id:pr.id,customer_id:c.id,items:[{job_id:j.id,lid:'L1',qty:2}]});}""")
    pg.wait_for_timeout(100)
    go(pg,"invoices.pending-billing"); print("pb:", txt(pg)); pg.click('[data-a="i-bill"]'); pg.wait_for_timeout(200)
    pg.fill("#up_no","INV/001"); pg.fill("#up_before","60000"); pg.fill("#up_gst","10800"); pg.dispatch_event("#up_gst","change"); pg.wait_for_timeout(80)
    print("after:", pg.inner_text("#up_after"))
    pg.click('#u-pform button[type=submit]'); pg.wait_for_timeout(80); print("pdf req:", pg.inner_text("#up_pdf-err"))
    pg.set_input_files("#up_pdf", files=[{"name":"inv.pdf","mimeType":"application/pdf","buffer":b"%PDF"}]); pg.wait_for_timeout(60)
    pg.click('#u-pform button[type=submit]'); pg.wait_for_timeout(300); print("inv:", pg.evaluate("location.hash"), pg.inner_text(".mv-note.ok"), txt(pg))
    pg.click('[data-a="i-eway"]'); pg.wait_for_timeout(80); pg.fill("#um_eway_no","EWB123"); pg.click('#u-mform button[type=submit]'); pg.wait_for_timeout(250)
    go(pg,"invoices.not-sent"); pg.click('[data-a="i-sent"]'); pg.wait_for_timeout(80); pg.select_option("#um_by",label="Ravi Kumar"); pg.set_input_files("#um_proof", files=[{"name":"p.png","mimeType":"image/png","buffer":b"\x89PNG"}]); pg.wait_for_timeout(60); pg.click('#u-mform button[type=submit]'); pg.wait_for_timeout(250)
    print("sent:", pg.inner_text(".mv-note.ok"))
    go(pg,"invoices.not-yet-paid"); pg.click('[data-a="i-pay"]'); pg.wait_for_timeout(80); pg.select_option("#um_status","Partly Paid"); pg.wait_for_timeout(80)
    pg.fill("#um_amount","20000"); pg.select_option("#um_fu_by",label="Sita Rao"); pg.fill("#um_next","2026-10-25"); pg.screenshot(path=f"{out}/pay.png"); pg.click('#u-mform button[type=submit]'); pg.wait_for_timeout(250)
    print("pay:", pg.inner_text(".mv-note.ok"))
    go(pg,"invoices.follow-up-again"); print("fu:", txt(pg))
    go(pg,"invoices.partly-paid"); pg.click('[data-a="i-pay"]'); pg.wait_for_timeout(80); pg.select_option("#um_status","Fully Paid"); pg.wait_for_timeout(80); pg.click('#u-mform button[type=submit]'); pg.wait_for_timeout(250)
    go(pg,"invoices.invoice-master"); print("im:", txt(pg)); print("pb after:", end=" "); go(pg,"invoices.pending-billing"); print(txt(pg))
    go(pg,"complaints.add"); pg.select_option("#up_project_id", index=1); pg.select_option("#up_priority","High"); pg.fill("#up_details","Light flickering"); pg.click('#u-pform button[type=submit]'); pg.wait_for_timeout(300)
    print("c:", pg.inner_text(".mv-note.ok"), txt(pg)); pg.click('[data-a="c-assign"]'); pg.wait_for_timeout(80); pg.select_option("#um_assigned_to",label="Ravi Kumar"); pg.fill("#um_target","2026-10-20"); pg.click('#u-mform button[type=submit]'); pg.wait_for_timeout(250)
    go(pg,"complaints.in-progress"); print("cip:", txt(pg)); pg.click('[data-a="c-resolve"]'); pg.wait_for_timeout(80); pg.fill("#um_resolution_remarks","Replaced driver"); pg.click('#u-mform button[type=submit]'); pg.wait_for_timeout(250)
    go(pg,"complaints.all"); print("call:", txt(pg)); pg.screenshot(path=f"{out}/cmp.png")
    print("errors:", errs); b.close()
