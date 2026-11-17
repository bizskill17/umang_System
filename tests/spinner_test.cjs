// Spinners: busy buttons, loading messages, background actions and the first-download badge.
const moduleRoot=process.env.UMANG_NODE_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium}=moduleRoot?require(moduleRoot+'/playwright'):require('playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.UMANG_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript({content:fs.readFileSync('tests/mockdb3.js','utf8')});
 await page.goto('file://'+path.resolve('index.html'));await page.waitForTimeout(400);if(await page.locator('.owner-continue').isVisible())await page.locator('.owner-continue').click();
 await page.evaluate(()=>location.hash='projects.dashboard');await page.waitForTimeout(500);
 // A busy button and a loading message get a spinner; it goes when the button is back to normal.
 await page.evaluate(()=>{const d=document.createElement('div');d.id='t-box';d.innerHTML='<button id="t-b" class="mv-btn" disabled>Sending to the Inventory system…</button><p class="mv-note" id="t-n">Loading items and masters…</p><button id="t-c" class="mv-btn">Save</button>';(document.getElementById('mod-live')||document.body).appendChild(d);});
 await page.waitForTimeout(100);
 assert(await page.locator('#t-b .u-spin, #t-b .ops-spinner').count()===1,'busy button spins');
 assert(await page.locator('#t-n .u-spin, #t-n .ops-spinner').count()===1,'loading message spins');
 assert.equal(await page.locator('#t-c .u-spin').count(),0,'a normal button does not spin');
 await page.evaluate(()=>{const b=document.getElementById('t-b');b.disabled=false;b.lastChild.textContent='Send';});await page.waitForTimeout(100);
 assert.equal(await page.locator('#t-b .u-spin').count(),0,'spinner goes when the button is done');
 // An action working in the background: its button spins and is disabled until it finishes.
 await page.evaluate(()=>{let done;window.__done=()=>done();U.act('t-slow',()=>new Promise(r=>{done=r;}));document.getElementById('t-box').insertAdjacentHTML('beforeend','<button type="button" id="t-s" class="mv-btn" data-a="t-slow">Create Project</button>');});
 await page.click('#t-s');await page.waitForTimeout(100);
 assert(await page.evaluate(()=>{const b=document.getElementById('t-s');return b.disabled&&b.querySelector('.u-spin')!==null;}),'background action shows a spinner');
 await page.evaluate(()=>window.__done());await page.waitForTimeout(100);
 assert(await page.evaluate(()=>{const b=document.getElementById('t-s');return !b.disabled&&!b.querySelector('.u-spin');}),'button is back when the action finishes');
 // First-download badge.
 await page.evaluate(()=>window.UmangBusy(true));assert(await page.locator('#u-syncing').isVisible(),'Loading data badge shows');
 await page.evaluate(()=>window.UmangBusy(false));assert(!(await page.locator('#u-syncing').isVisible()),'badge hides');
 assert.deepEqual(errors,[]);console.log('Spinner checks passed: busy buttons, loading messages, background actions, first-download badge.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
