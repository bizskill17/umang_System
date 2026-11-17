// Date boxes show and take dd/mm/yyyy even in a US-English browser; the app still reads yyyy-mm-dd.
const moduleRoot=process.env.UMANG_NODE_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium}=moduleRoot?require(moduleRoot+'/playwright'):require('playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.UMANG_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1366,height:900},locale:'en-US'});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript({content:fs.readFileSync('tests/mockdb3.js','utf8')});
 await page.goto('file://'+path.resolve('index.html'));await page.waitForTimeout(400);if(await page.locator('.owner-continue').isVisible())await page.locator('.owner-continue').click();
 await page.evaluate(async()=>{const a=(p,id,d)=>U.db.collection(p).doc(id).set(d);
  await a(U.m('users'),'u1',{name:'Ravi',status:'Active'});await a(U.m('firm'),'f1',{name:'Umang',short_name:'UM',status:'Active'});await a(U.m('customers'),'c1',{name:'Asha Traders'});
  await a('leads','l1',{lead_no:'L1',date:'2026-10-01',customer_id:'c1',firm_id:'f1',owner_id:'u1',assigned_to:'u1',status:'In Progress'});
  await a('leads','l2',{lead_no:'L2',date:'2026-11-05',customer_id:'c1',firm_id:'f1',owner_id:'u1',assigned_to:'u1',status:'In Progress'});});
 // Filter bar: From date typed as dd/mm/yyyy filters the list.
 await page.evaluate(()=>location.hash='leads.master');await page.waitForTimeout(700);
 await page.click('.mv-ficon');await page.waitForTimeout(200);
 const from=page.locator('#lf-from__dmy');assert.equal(await from.getAttribute('placeholder'),'dd/mm/yyyy');
 await from.fill('01/11/2026');await from.press('Enter');await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>document.getElementById('lf-from').value),'2026-11-01','the app gets yyyy-mm-dd');
 if(!(await from.isVisible())){await page.click('.mv-ficon');await page.waitForTimeout(200);}
 assert.equal(await page.inputValue('#lf-from__dmy'),'01/11/2026','still shown as dd/mm/yyyy after the list redraws');
 assert.equal(await page.evaluate(()=>(document.querySelector('.mv-fbadge')||{}).textContent),'1','the Filters badge counts the date once');
 const rows=await page.evaluate(()=>[...document.querySelectorAll('table.lead-table tbody tr')].map(r=>r.innerText).join('|'));
 assert(rows.includes('L2')&&!rows.includes('L1 '),'only leads from 01/11/2026 on: '+rows.slice(0,200));
 // Typing without slashes, and a wrong date is refused.
 if(!(await from.isVisible())){await page.click('.mv-ficon');await page.waitForTimeout(200);}
 await from.fill('');await page.waitForTimeout(300);if(!(await from.isVisible())){await page.click('.mv-ficon');await page.waitForTimeout(200);}await from.type('05112026');await page.waitForTimeout(300);assert.equal(await page.inputValue('#lf-from__dmy'),'05/11/2026');
 assert.equal(await page.evaluate(()=>document.getElementById('lf-from').value),'2026-11-05');
 if(!(await from.isVisible())){await page.click('.mv-ficon');await page.waitForTimeout(200);}
 await from.fill('31/02/2026');await from.press('Enter');await page.waitForTimeout(200);assert(await from.evaluate(e=>e.classList.contains('dmy-bad')),'31/02 is marked wrong');
 assert.equal(await page.evaluate(()=>document.getElementById('lf-from').value),'2026-11-05','a wrong date does not change the filter');
 // A form date field: shows today's date as dd/mm/yyyy; code that sets the value updates the box.
 await page.evaluate(()=>location.hash='design.add');await page.waitForTimeout(700);
 const iso=await page.evaluate(()=>U.today()),dmy=iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
 const dateBox=page.locator('.dmy-wrap input.dmy-text:visible').first();assert.equal(await dateBox.inputValue(),dmy);
 await dateBox.evaluate(t=>{t.parentNode.querySelector('input[type=date]').value='2026-12-25';});assert.equal(await dateBox.inputValue(),'25/12/2026');
 assert.equal(await page.evaluate(()=>document.querySelectorAll('input[type=date]:not(.dmy-wrap input)').length),0,'every date box is converted');
 await page.screenshot({path:'/tmp/umang-datefmt.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no sideways scroll on a phone');
 assert.deepEqual(errors,[]);console.log('Date format checks passed: dd/mm/yyyy shown and typed in filters and forms, app keeps yyyy-mm-dd, wrong dates refused, mobile.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
