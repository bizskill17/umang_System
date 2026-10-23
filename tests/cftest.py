import sys; sys.path.insert(0,sys.argv[3])
from common import *
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b,pg,errs=setup(p,sys.argv[1])
    pg.evaluate("""async()=>{const d=U.db; const a=(p,o)=>d.collection(p).add(o);
      const s=await a('masters/state/rows',{name:'Assam',status:'Active'}); const c1=await a('masters/city/rows',{name:'Guwahati',state_id:s.id,status:'Active'}); const c2=await a('masters/city/rows',{name:'Dibrugarh',state_id:s.id,status:'Active'});
      const k1=await a('masters/customer-category/rows',{name:'Builder',status:'Active'}); const k2=await a('masters/customer-category/rows',{name:'Gym',status:'Active'});
      await a('masters/customers/rows',{name:'Manish Jain',category_id:k1.id,state_id:s.id,city_id:c1.id,status:'Active'}); await a('masters/customers/rows',{name:'Pankaj Jain',category_id:k2.id,state_id:s.id,city_id:c2.id,status:'Active'});}""")
    go(pg,"leads.m-customers",250); pg.click("#master-view .mv-ficon"); pg.wait_for_timeout(50)
    print("panel:", pg.eval_on_selector("#master-view .mv-fpanel","e=>e.innerText.replace(/\\n/g,' | ')"))
    pg.select_option("#mv-cf-city_id", label="Dibrugarh"); pg.wait_for_timeout(120); print("city:", txt(pg,"#master-view tbody"))
    pg.select_option("#mv-cf-category_id", label="Builder"); pg.wait_for_timeout(120); print("both:", txt(pg,"#master-view tbody"), "| badge", pg.inner_text("#master-view .mv-fbadge"))
    pg.screenshot(path=sys.argv[2]+"/cf.png")
    pg.click('#master-view [data-act="clear-f"]'); pg.wait_for_timeout(120); print("clear:", txt(pg,"#master-view tbody"))
    go(pg,"leads.m-city",200); pg.click("#master-view .mv-ficon"); print("city view:", pg.eval_on_selector("#master-view .mv-fpanel","e=>e.innerText.replace(/\\n/g,' | ')"))
    go(pg,"projects.m-machines",200); pg.click("#master-view .mv-ficon"); print("machines:", pg.eval_on_selector("#master-view .mv-fpanel","e=>e.innerText.replace(/\\n/g,' | ')"))
    print("errors:", errs); b.close()
