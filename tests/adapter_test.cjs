const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const code = fs.readFileSync('assets/hostinger.js', 'utf8');
const calls = [], timers = new Map(); let nextTimer = 0, docs = [], snapshots = [], failure = false;
const context = { URL, FormData, Blob, crypto, Set, Promise, console,
  location: { hash: '#projects.pending-sheet', reload() {} },
  document: { baseURI: 'https://example.test/', hidden: false },
  addEventListener() {},
  setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
  clearTimeout(id) { timers.delete(id); },
  async fetch(url, opts) {
    const u = new URL(url), action = u.searchParams.get('action');
    calls.push({action, opts});
    if (action === 'session') return {ok:true, json:async()=>({csrf:'test-token',user:{id:'owner',owner:true}})};
    if (action === 'list') {
      if (failure) throw new Error('offline');
      return {ok:true, json:async()=>({docs: structuredClone(docs)})};
    }
    if (action === 'acquire') return {ok:true, json:async()=>({acquired:true})};
    if (action === 'set') { const data=JSON.parse(opts.body); docs=[{id:data.id,data:data.data}]; }
    return {ok:true, json:async()=>({ok:true})};
  }
};
context.window=context;
const tick = () => new Promise(resolve=>setImmediate(resolve));
(async()=>{
  vm.runInNewContext(code,context);
  await context.UmangServer.ready;
  const db=await context.claude.use('db');
  let errors=0;
  const unsubscribe=db.collection('projects').onSnapshot(s=>snapshots.push(s.docs.map(d=>d.data())),()=>errors++);
  await tick(); assert.deepEqual(snapshots[0],[]);
  const row=await db.collection('projects').add({name:'Project one'});
  await tick(); assert.equal(snapshots.at(-1)[0].name,'Project one');
  assert.equal(calls.find(c=>c.action==='set').opts.headers['X-CSRF-Token'],'test-token');
  const counter=db.doc('counters/project-26-27');
  await counter.acquire({holder:'lease-one',ttlMs:8000});
  await counter.set({next:2});
  assert.equal(JSON.parse(calls.filter(c=>c.action==='set').at(-1).opts.body).holder,'lease-one');
  failure=true;
  const poll=[...timers.values()].at(-1); poll(); await tick(); assert.equal(errors,1);
  failure=false; const recover=[...timers.values()].at(-1); recover(); await tick();
  assert.equal(snapshots.at(-1)[0].next,2);
  unsubscribe();
  assert.match(context.UmangServer.blobURL('abc'),/api\/index.php\?action=blob&id=abc/);
  // Loading in the original artifact runtime leaves its existing storage untouched.
  const existing={use:async()=>null}, original={window:{claude:existing}};
  vm.runInNewContext(code,original); assert.equal(original.window.claude,existing);
  console.log('Adapter tests passed: snapshots, immediate refresh, CSRF, leases, retry and runtime compatibility.');
})().catch(e=>{console.error(e);process.exitCode=1;});
