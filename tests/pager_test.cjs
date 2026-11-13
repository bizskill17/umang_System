// Pagination on list tables: 25 rows by default, numbered pages, rows per page remembered, search goes back to page 1, Excel keeps every row.
const moduleRoot=process.env.UMANG_NODE_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium}=moduleRoot?require(moduleRoot+'/playwright'):require('playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.UMANG_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript({content:fs.readFileSync('tests/mockdb3.js','utf8')});
 await page.goto('file://'+path.resolve('index.html'));await page.waitForTimeout(400);if(await page.locator('.owner-continue').isVisible())await page.locator('.owner-continue').click();
 await page.evaluate(async()=>{const a=(p,id,d)=>U.db.collection(p).doc(id).set(d);await a(U.m('customer-category'),'cc1',{name:'Retail',status:'Active'});
  for(let i=1;i<=60;i++)await a(U.m('customers'),'c'+String(i).padStart(3,'0'),{name:'Customer '+String(i).padStart(3,'0'),category_id:'cc1',mobile:'98640'+String(10000+i)});
  await a(U.m('users'),'u1',{name:'Ravi',status:'Active'});await a(U.m('firm'),'f1',{name:'Umang',short_name:'UM',status:'Active'});
  for(let i=1;i<=30;i++)await a('leads','l'+i,{lead_no:'L'+i,date:'2026-10-01',customer_id:'c001',firm_id:'f1',owner_id:'u1',assigned_to:'u1',status:'In Progress'});});
 await page.evaluate(()=>location.hash='masters.m-customers');await page.waitForTimeout(600);
 const vis=()=>page.evaluate(()=>[...document.querySelectorAll('#master-view tbody tr')].filter(r=>getComputedStyle(r).display!=='none').length);
 assert.equal(await vis(),25);assert((await page.innerText('.pgr')).includes('Showing 1–25 of 60'));
 await page.click('.pgr [data-pg="3"]');await page.waitForTimeout(100);assert.equal(await vis(),10);assert((await page.innerText('.pgr')).includes('51–60'));
 await page.selectOption('.pgr select','10');await page.waitForTimeout(100);assert.equal(await vis(),10);assert((await page.innerText('.pgr')).includes('1–10 of 60'));
 await page.click('.pgr [data-pg="2"]');await page.waitForTimeout(100);
 await page.fill('#mv-q','Customer 05');await page.waitForTimeout(400);assert.equal(await vis(),10);assert.equal(await page.locator('.pgr').count(),0,'10 matches fit on one page');
 await page.fill('#mv-q','');await page.waitForTimeout(400);assert((await page.innerText('.pgr')).includes('1–10 of 60'),'search went back to page 1');
 const all=await page.evaluate(()=>document.querySelectorAll('#master-view tbody tr').length);assert.equal(all,60,'all rows stay in the table for Excel');
 await page.evaluate(()=>location.hash='leads.master');await page.waitForTimeout(600);
 await page.locator('.pgr').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/umang-pager.png'});const lv=await page.evaluate(()=>[...document.querySelectorAll('table.lead-table tbody tr')].filter(r=>getComputedStyle(r).display!=='none').length);
 assert.equal(lv,25);assert((await page.innerText('.pgr')).includes('Showing 1–25 of 30'));
 await page.screenshot({path:'/tmp/umang-pager.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);console.log('Pagination checks passed: 25 rows by default, page buttons, rows per page, search resets to page 1, all rows kept for Excel, mobile.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
