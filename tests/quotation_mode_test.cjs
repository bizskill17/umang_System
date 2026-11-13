// Quotation Settings: make in app, upload a file, or both; jobs for uploaded quotations pick items from the Items master.
const moduleRoot=process.env.UMANG_NODE_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium}=moduleRoot?require(moduleRoot+'/playwright'):require('playwright');
const fs=require('fs'),assert=require('assert'),path=require('path'),os=require('os');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.UMANG_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!/ERR_|Failed to load resource/.test(m.text()))errors.push(m.text());});
 await page.addInitScript({content:fs.readFileSync('tests/mockdb3.js','utf8')});
 await page.goto('file://'+path.resolve('index.html'));await page.waitForTimeout(400);if(await page.locator('.owner-continue').isVisible())await page.locator('.owner-continue').click();
 await page.evaluate(async()=>{const a=(p,id,data)=>U.db.collection(p).doc(id).set(data);await a(U.m('customers'),'c1',{name:'Acme',status:'Active'});await a(U.m('users'),'u1',{name:'Ravi',status:'Active'});await a(U.m('firm'),'f1',{name:'Umang',short_name:'UM',status:'Active'});
  await a(U.m('items'),'i1',{name:'Glow Sign Board',status:'Active'});await a(U.m('uom'),'n1',{name:'Nos',status:'Active'});await a(U.m('gst'),'g1',{name:'18',status:'Active'});
  await a('leads','l1',{lead_no:'L1',date:'2026-10-01',customer_id:'c1',firm_id:'f1',owner_id:'u1',assigned_to:'u1',status:'In Progress'});
  await a('quotations','q0',{lead_id:'l1',lead_no:'L1',firm_id:'f1',customer_id:'c1',assigned_to:'u1',status:'Pending Prepare Quotation',assigned_date:'2026-10-01'});});
 const go=async(hash)=>{await page.evaluate(h=>location.hash=h,hash);await page.waitForTimeout(300);assert(!(await page.locator('body').innerText()).includes('Something went wrong showing'),hash);};
 // Default is "Make in app": no type choice, the item table shows.
 await go('quotations.add');assert(!(await page.locator('#up_mode').count()));assert(await page.locator('#qi-wrap').isVisible());
 await go('quotations.quotation-settings');assert.equal(await page.locator('input[name="qs_mode"]').count(),3);assert(await page.locator('input[value="app"]').isChecked());
 await page.locator('input[value="both"]').check();await page.locator('[data-a="qs-save"]').click();await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>U.rows('app_settings').find(r=>r.key==='quotation').mode),'both');
 // Both: choose Upload quotation.
 await go('quotations.prepare');await page.locator('[data-a="q-prepare"]').first().click();await page.waitForTimeout(250);
 await page.selectOption('#up_mode','upload');await page.waitForTimeout(250);assert(!(await page.locator('#qi-wrap').count()));
 await page.fill('#up_amt_before','10000');await page.fill('#up_amt_gst','1800');await page.waitForTimeout(50);assert((await page.locator('#up_amt_after').innerText()).includes('11,800'));
 await page.locator('#u-pform button[type=submit]').click();await page.waitForTimeout(250);assert(await page.locator('#up_file-err').isVisible(),'file is required');
 const pdf=path.join(os.tmpdir(),'umang-quote.pdf');fs.writeFileSync(pdf,'%PDF-1.4\n%test\n');await page.setInputFiles('#up_file',pdf);await page.waitForTimeout(200);
 await page.locator('#u-pform button[type=submit]').click();await page.waitForTimeout(500);
 const q=await page.evaluate(()=>U.get('quotations','q0'));assert.equal(q.mode,'upload');assert.equal(q.total,11800);assert.equal(q.subtotal,10000);assert.equal(q.gst,1800);assert(q.file&&q.file.id);assert.deepEqual(q.items,[]);assert.equal(q.status,'Pending Checking');assert(q.no);
 await go('quotations.master');await page.locator('[data-a="q-view"]').first().click();await page.waitForTimeout(200);const vt=await page.locator('#u-modal').innerText();assert(vt.includes('Uploaded quotation'));assert(await page.locator('#u-modal a[data-blob]').count());await page.keyboard.press('Escape');
 // Upload only: no type choice, amount and file fields show.
 await go('quotations.quotation-settings');await page.locator('input[value="upload"]').check();await page.locator('[data-a="qs-save"]').click();await page.waitForTimeout(250);
 await go('quotations.add');assert(!(await page.locator('#up_mode').count()));assert(await page.locator('#up_amt_before').isVisible());assert(await page.locator('#up_file').isVisible());
 // Job for a project from the uploaded quotation: particulars come from the Items master.
 await page.evaluate(async()=>{await U.upd('quotations','q0',{status:'Approved'});await U.db.collection('projects').doc('p1').set({no:'P1',seq:1,date:'2026-10-01',customer_id:'c1',firm_id:'f1',lead_id:'l1',quotation_id:'q0',owner:'u1',status:'In Progress'});});await page.waitForTimeout(200);
 await go('projects.add-job');await page.selectOption('#up_project_id','p1');await page.waitForTimeout(300);
 const opts=await page.locator('select[name="ji_src_0"]').evaluate(e=>[...e.options].map(o=>o.text));assert(opts.includes('Glow Sign Board'),JSON.stringify(opts));assert.equal(opts[0],'Select Item');
 assert.deepEqual(errors,[]);console.log('Quotation mode checks passed: settings (app, upload, both), uploaded quotation save and view, job items from the Items master.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
