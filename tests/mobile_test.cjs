const root=process.env.UMANG_NODE_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium}=root?require(root+'/playwright'):require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
(async()=>{const b=await chromium.launch({executablePath:process.env.UMANG_CHROMIUM,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});let errors=[];
 for(const width of [320,360,390,412,768,1440]){
  const page=await b.newPage({viewport:{width,height:900},isMobile:width<800});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript({content:fs.readFileSync('tests/mockdb3.js','utf8')});await page.goto('file://'+path.resolve('index.html'));await page.waitForTimeout(100);if(await page.locator('.owner-continue').isVisible())await page.locator('.owner-continue').click();
  await page.evaluate(async()=>{const a=(p,id,o)=>U.db.collection(p).doc(id).set(o);await a(U.m('customers'),'c',{name:'Customer with a long company name',status:'Active'});await a(U.m('users'),'u',{name:'Administrator',status:'Active'});await a(U.m('vendors'),'v',{name:'Outsource Vendor',status:'Active'});await a('projects','p',{no:'26-27/1',customer_id:'c',status:'In Progress',date:'2026-10-01',due:'2026-11-01'});await a('designs','d',{no:'D1',customer_id:'c',project_id:'p',count:2,done:{},vendor_id:'v',status:'In Progress',date:'2026-10-01',due:'2026-11-01'});});
  for(const route of ['home','outsource.all','leads.dashboard','recce.dashboard','design.dashboard','quotations.dashboard','projects.dashboard','leads.add','recce.add','design.add','quotations.add','projects.add','projects.add-job','projects.add-delivery','projects.master','masters.m-customers']){
   await page.evaluate(r=>location.hash=r,route);await page.waitForTimeout(100);
   const size=await page.evaluate(()=>({inner:innerWidth,scroll:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
   assert.equal(size.inner,width,JSON.stringify({route,width,...size}));
   if(size.scroll>width+1){console.log('OVERFLOW',route,width,size,await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(e).position!=='fixed'&&!e.closest('.mv-table-wrap,.ss-pop')).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,w:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))));throw Error('Page overflow');}
   if(route==='home'){assert(await page.locator('#home-view a[href="#outsource"]').isVisible());if(width===390)await page.screenshot({path:'/tmp/umang-mobile-home.png',fullPage:true});}
   if(route==='outsource.all'){assert((await page.locator('#mod-live').innerText()).includes('Outsource Vendor'));assert(await page.locator('#mod-live thead').isVisible());}
   if(route==='quotations.add'&&width===390)await page.screenshot({path:'/tmp/umang-mobile-quotation.png',fullPage:true});
   if(route==='projects.master'&&width===390){await page.locator('[data-a="p-view"]').click();await page.waitForTimeout(100);assert(await page.locator('#u-modal').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.keyboard.press('Escape');await page.locator('#menu-open').click();assert(await page.locator('#side-menu').evaluate(e=>e.classList.contains('open')));await page.locator('#menu-close').click();}
  }
  await page.close();console.log('Mobile/layout checks passed at',width);
 }
 assert.deepEqual(errors,[]);await b.close();})().catch(e=>{console.error(e);process.exit(1);});
