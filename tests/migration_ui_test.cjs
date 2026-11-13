// Data Migration page against the real PHP API: backup download, file check, CLEAR confirmation and import result.
const root=process.env.UMANG_NODE_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium}=root?require(root+'/playwright'):require('playwright');
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert'),{spawn}=require('child_process');
(async()=>{const temp=fs.mkdtempSync(path.join(os.tmpdir(),'umang-mig-ui-')),web=path.join(temp,'public_html');fs.mkdirSync(web);fs.mkdirSync(path.join(temp,'config'));fs.cpSync('api',path.join(web,'api'),{recursive:true});fs.copyFileSync('index.html',path.join(web,'index.html'));fs.cpSync('assets',path.join(web,'assets'),{recursive:true});
const pass='UI-test-only-password-123';fs.writeFileSync(path.join(temp,'config/database.php'),"<?php return json_decode('"+JSON.stringify({driver:'sqlite',host:'localhost',database:'umang_test',username:'test',password:'REPLACE_UNUSED',admin_username:'admin',admin_password:pass})+"',true);");
const srv=http.createServer();await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;await new Promise(r=>srv.close(r));const url='http://127.0.0.1:'+port;let logs='';const php=spawn(process.env.UMANG_PHP||'php',['-S','127.0.0.1:'+port,'-t',web]);php.stdout.on('data',b=>logs+=b);php.stderr.on('data',b=>logs+=b);
let browser;try{for(let i=0;i<100;i++){try{await fetch(url+'/api/index.php?action=session');break;}catch(e){await new Promise(r=>setTimeout(r,50));}}
 browser=await chromium.launch({executablePath:process.env.UMANG_CHROMIUM,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage({viewport:{width:1366,height:1000},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.fill('#login-email','admin');await page.fill('#login-password',pass);await page.click('#login-form button[type=submit]');await page.waitForSelector('#home-view',{state:'visible'});
 await page.evaluate(async()=>{await U.db.collection(U.m('vendors')).doc('v-old').set({name:'Old Vendor',status:'Active'});});
 await page.evaluate(()=>location.hash='masters.data-migration');await page.waitForSelector('[data-a=mig-backup]');
 const pkg={kind:'umang-master-import',clear:['vendors','state'],keep_users:['Pankaj Jain','Amit Jain'],rows:{state:[{id:'s1',name:'Assam',legacy_ids:['Assam'],status:'Active'}],vendors:[{id:'v1',name:'Graphic India',category:'Recce',legacy_ids:['9b93ec22'],status:'Active'}]}};
 const f=path.join(temp,'umang-masters-import.json');fs.writeFileSync(f,JSON.stringify(pkg));await page.setInputFiles('#mig-file',f);await page.waitForSelector('[data-a=mig-one][data-id=vendors]');
 await page.click('[data-a=mig-one][data-id=vendors]');await page.waitForTimeout(200);assert((await page.innerText('body')).includes('Type CLEAR'));
 await page.fill('#mig-confirm','CLEAR');await page.click('[data-a=mig-one][data-id=vendors]');await page.waitForTimeout(200);assert((await page.innerText('body')).includes('Download the backup first'));
 const dl=page.waitForEvent('download');await page.click('[data-a=mig-backup]');const d=await dl;const bk=JSON.parse(fs.readFileSync(await d.path(),'utf8'));assert.equal(bk.kind,'umang-master-backup');
 await page.click('[data-a=mig-one][data-id=state]');await page.waitForSelector('text=States imported.');
 await page.click('[data-a=mig-one][data-id=vendors]');await page.waitForSelector('text=Vendors imported.');
 const t=await page.innerText('#mod-live');assert(t.includes('cleared 1, added 1'),t);
 await page.evaluate(async()=>{await U.db.collection(U.m('vendors')).doc('v-x').set({name:'Another',status:'Active'});});
 await page.click('[data-a=mig-one][data-id=vendors]');await page.waitForTimeout(100);
 const pkg2={kind:'umang-master-import',clear:['vendors','city'],keep_users:[],rows:{city:[{id:'c1',name:'Guwahati',state_id:'s1',legacy_ids:['x'],status:'Active'}],vendors:[{id:'v1',name:'Graphic India',legacy_ids:['9b93ec22'],status:'Active'}]}};
 fs.writeFileSync(f,JSON.stringify(pkg2));await page.setInputFiles('#mig-file',f);await page.waitForSelector('[data-a=mig-all]');await page.fill('#mig-confirm','CLEAR');await page.click('[data-a=mig-all]');await page.waitForSelector('text=All masters imported.');
 const vs2=await page.evaluate(async()=>(await window.UmangServer.migrate({cmd:'status'})).masters);assert.equal(vs2.city,1);assert.equal(vs2.vendors,1);
 const vs=await page.evaluate(async()=>(await window.UmangServer.migrate({cmd:'status'})).masters);assert.equal(vs.vendors,1);assert.equal(vs.state,1);
 await page.screenshot({path:'/tmp/umang-migration.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Data Migration UI passed against real PHP API: backup download, CLEAR confirmation, import result.');
 }catch(e){console.error(logs.slice(-1800));throw e;}finally{if(browser)await browser.close();php.kill();}
})().catch(e=>{console.error(e);process.exit(1);});
