/* Pagination for every list table (option A): numbered pages, Prev/Next and rows per page (10/25/50/100, default 25).
   Rows past the page are only hidden, so search, filters and Excel still cover every row. Editing tables inside
   forms and dialogs are left alone. The rows-per-page choice is remembered for each screen. */
(function(){'use strict';
var SIZES=[10,25,50,100],DEF=25,state={},busy=false;
var css='.pgr{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 14px;margin:0 0 6px;background:#fff;border:1px solid #e3e7ef;border-top:0;border-radius:0 0 14px 14px;font-size:13.5px;color:#4a5468}'+
 '.pgr-pages{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.pgr button{min-width:34px;height:34px;border-radius:9px;border:1px solid #d7deea;background:#fff;font:inherit;font-weight:600;color:#25304a;padding:0 10px;cursor:pointer}'+
 '.pgr button[aria-current=page]{background:#1f6f5c;border-color:#1f6f5c;color:#fff}.pgr button:disabled{color:#b8c0cf;cursor:default}.pgr .pgr-dots{color:#8a93a6;padding:0 2px}'+
 '.pgr-size{display:flex;align-items:center;gap:8px}.pgr-size span{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#7a8396;font-weight:700}.pgr select{height:34px;border:1px solid #d7deea;border-radius:9px;padding:0 8px;font:inherit;background:#fff}'+
 'tr.pgr-hide{display:none!important}@media(max-width:640px){.pgr{justify-content:center}.pgr-info{width:100%;text-align:center}}';
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
function skip(t){return !t.tBodies[0]||t.closest('form,#u-modal,.u-modal,dialog,[data-nopage]')||/\b(qi-table|ji-table|wo-lines|mi-table|rji-table|wo-ctable|msx-gt)\b/.test(t.className);}
function sizeFor(key){try{var v=+localStorage.getItem('pgr:'+key);if(SIZES.indexOf(v)>=0)return v;}catch(e){}return DEF;}
function filterSig(t){var root=t.closest('#master-view,#mod-live,main')||document;return Array.prototype.map.call(root.querySelectorAll('input[type=search],[data-uf],[data-f]'),function(i){return i.value;}).join('|');}
function rowsOf(t){return Array.prototype.filter.call(t.tBodies[0].rows,function(r){return !(r.cells.length===1&&r.cells[0].colSpan>1);});}
function apply(t,idx){
 var view=(location.hash||'#').split('?')[0],key=view+'#'+idx,rows=rowsOf(t),total=rows.length,s=state[key]||(state[key]={page:1,size:sizeFor(view)});
 var sig=filterSig(t)+'|'+t.tBodies[0].rows.length;if(s.sig!==undefined&&s.sig.split('|').slice(0,-1).join('|')!==sig.split('|').slice(0,-1).join('|'))s.page=1;s.sig=sig;
 var old=t.__pgr;var need=total>DEF||(s.size<DEF&&total>s.size);
 if(!need){rows.forEach(function(r){r.classList.remove('pgr-hide');});if(old&&old.parentNode)old.remove();t.__pgr=null;return;}
 var pages=Math.max(1,Math.ceil(total/s.size));if(s.page>pages)s.page=pages;
 var a=(s.page-1)*s.size,b=Math.min(total,a+s.size);
 rows.forEach(function(r,i){var h=i<a||i>=b;if(r.classList.contains('pgr-hide')!==h)r.classList.toggle('pgr-hide',h);});
 var nums=[],p=s.page;[1,p-2,p-1,p,p+1,p+2,pages].forEach(function(n){if(n>=1&&n<=pages&&nums.indexOf(n)<0)nums.push(n);});nums.sort(function(x,y){return x-y;});
 var btn='';nums.forEach(function(n,i){if(i&&n-nums[i-1]>1)btn+='<span class="pgr-dots">…</span>';btn+='<button type="button" data-pg="'+n+'"'+(n===p?' aria-current="page"':'')+' aria-label="Page '+n+'">'+n+'</button>';});
 var html='<span class="pgr-info">Showing <b>'+(a+1).toLocaleString('en-IN')+'–'+b.toLocaleString('en-IN')+'</b> of <b>'+total.toLocaleString('en-IN')+'</b></span>'+
  '<span class="pgr-pages"><button type="button" data-pg="'+(p-1)+'"'+(p<=1?' disabled':'')+'>‹ Prev</button>'+btn+'<button type="button" data-pg="'+(p+1)+'"'+(p>=pages?' disabled':'')+'>Next ›</button></span>'+
  '<label class="pgr-size"><span>Rows</span><select aria-label="Rows per page">'+SIZES.map(function(z){return'<option'+(z===s.size?' selected':'')+'>'+z+'</option>';}).join('')+'</select></label>';
 var bar=old&&old.isConnected?old:document.createElement('div');
 if(bar.dataset.html!==html){bar.className='pgr';bar.innerHTML=html;bar.dataset.html=html;}
 bar.__t=t;bar.__key=key;bar.__view=view;t.__pgr=bar;
 var anchor=t.closest('.mv-table-wrap,.ldx-tw,.ops-table')||t;if(anchor.nextSibling!==bar)anchor.parentNode.insertBefore(bar,anchor.nextSibling);
}
function run(){busy=true;try{var i=0,live=[];document.querySelectorAll('table.mv-table,table.ldx-t').forEach(function(t){if(skip(t)||!t.offsetParent)return;apply(t,i++);if(t.__pgr)live.push(t.__pgr);});
 document.querySelectorAll('.pgr').forEach(function(b){if(live.indexOf(b)<0){if(b.__t)b.__t.__pgr=null;b.remove();}});}finally{busy=false;}}
var queued=false;function soon(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;run();});}
new MutationObserver(function(ms){if(busy)return;for(var i=0;i<ms.length;i++){var n=ms[i].target;if(n.closest&&n.closest('.pgr'))continue;soon();return;}}).observe(document.body,{childList:true,subtree:true});
document.addEventListener('click',function(e){var b=e.target.closest('.pgr [data-pg]');if(!b||b.disabled)return;var bar=b.closest('.pgr'),s=state[bar.__key];s.page=+b.dataset.pg;run();var t=bar.__t;if(t){var r=t.getBoundingClientRect();if(r.top<0)t.scrollIntoView({block:'start'});}});
document.addEventListener('change',function(e){var sel=e.target.closest('.pgr select');if(!sel)return;var bar=sel.closest('.pgr'),s=state[bar.__key];s.size=+sel.value;s.page=1;try{localStorage.setItem('pgr:'+bar.__view,s.size);}catch(x){}
 Object.keys(state).forEach(function(k){if(k.indexOf(bar.__view+'#')===0)state[k].size=s.size;});run();});
window.addEventListener('hashchange',soon);
window.UmangPager={run:run};
})();
