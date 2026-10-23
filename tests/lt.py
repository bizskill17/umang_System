import sys; sys.path.insert(0,sys.argv[2])
from common import *
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b,pg,errs=setup(p,sys.argv[1])
    pg.evaluate("""async()=>{const d=U.db; const a=(p,o)=>d.collection(p).add(o); ['masters/customers/rows','leads'].forEach(U.watch); await new Promise(r=>setTimeout(r,100));
      const s=await a('masters/state/rows',{name:'Assam',status:'Active'}); const c=await a('masters/city/rows',{name:'Guwahati',state_id:s.id,status:'Active'});
      const k=await a('masters/customer-category/rows',{name:'Builder',status:'Active'}); const sc=await a('masters/customer-subcategory/rows',{name:'Residential',status:'Active'});
      const cu=U.mrows('customers')[0]; await d.collection('masters/customers/rows').doc(cu.id).update({category_id:k.id,subcategory_ids:[sc.id],city_id:c.id,state_id:s.id,address:'12 GS Road',mobile:'9876543210',email_id:'acme@x.in',contacts:[{name:'Rahul',mobile:'9000000001',email:'rahul@acme.in'}]});
      const l=U.rows('leads')[0]; await d.collection('leads').doc(l.id).update({last_fu:{status:'Follow Up Again',date:'2026-10-16',next_date:'2026-10-20',remarks:'Call again',auto:false}});
      await a('recce',{lead_id:l.id,units:3,done:{completed:1},status:'In Progress'});}""")
    go(pg,"leads.in-progress",400)
    print(pg.eval_on_selector_all("#leads-live tbody td","e=>e.map(x=>x.innerText.split('\\n').join(' '))"))
    pg.screenshot(path=sys.argv[2]+"/lt.png")
    go(pg,"leads.completed",200); print(pg.eval_on_selector_all("#leads-live thead th","e=>e.length"))
    print(errs); b.close()
