def setup(p, src, w=1366):
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":w,"height":900}); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m: m.type=="error" and "ERR_TUNNEL" not in m.text and errs.append(m.text))
    pg.route("**/pdf-lib.min.js", lambda r: r.fulfill(path="/opt/npm-tools/node_modules/pdf-lib/dist/pdf-lib.min.js", content_type="application/javascript"))
    pg.goto("file://"+src); pg.fill("#login-email","admin"); pg.fill("#login-password","x"); pg.click(".login-btn"); pg.wait_for_timeout(150)
    pg.evaluate("""async()=>{const d=U.db; const a=(p,o)=>d.collection(p).add(o);
      const c1=await a('masters/customers/rows',{name:'Acme Retail',status:'Active',address:'12 MG Road, Pune',gstin_uin:'27ABCDE1234F1Z5'});
      const u1=await a('masters/users/rows',{name:'Ravi Kumar',status:'Active'}); const u2=await a('masters/users/rows',{name:'Sita Rao',status:'Active'});
      await a('masters/vendors/rows',{name:'PrintCo',status:'Active'});
      const f=await a('masters/firm/rows',{name:'Umang Communications',short_name:'UMANG',status:'Active',address:'Plot 4, MIDC, Pune',gst:'27AAAAA0000A1Z5',terms_conditions:'50% advance.\\nDelivery in 10 days.',bank_details:'HDFC Bank A/c 123'});
      await a('masters/items/rows',{name:'Glow Sign Board',status:'Active'}); await a('masters/items/rows',{name:'ACP Letters',status:'Active'});
      for (const u of ['Foot','Inch','cm','Metre','Nos']) await a('masters/uom/rows',{name:u,status:'Active'});
      for (const g of ['5','12','18']) await a('masters/gst/rows',{name:g,status:'Active'});
      await a('masters/send-mode/rows',{name:'Email',status:'Active'});
      for (const m of [['Roland 1','Printing'],['CO2 Laser','Laser'],['Weld Bay','Fabrication'],['CNC Router','Cutting']]) await a('masters/machines/rows',{name:m[0],job_step:m[1],status:'Active'});
      await a('masters/transporters/rows',{name:'VRL',status:'Active'}); await a('masters/vehicles/rows',{name:'MH12AB1234',status:'Active'});
      const l=await a('leads',{lead_no:'26-27/1',fy:'26-27',seq:1,customer_id:c1.id,firm_id:f.id,owner_id:u2.id,assigned_to:u1.id,status:'In Progress'});
      await a('quotations',{lead_id:l.id,lead_no:'26-27/1',firm_id:f.id,customer_id:c1.id,assigned_to:u1.id,status:'Pending Prepare Quotation',assigned_date:'2026-10-10'});}""")
    pg.wait_for_timeout(100)
    return b,pg,errs
def go(pg,h,t=180): pg.evaluate(f"location.hash='{h}'"); pg.wait_for_timeout(t)
def txt(pg,sel="#mod-live tbody"): return pg.inner_text(sel).replace("\n"," | ")
