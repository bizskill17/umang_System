/* Master Data → Speed Check: how long syncing and drawing screens takes on this device, to find what is slow. */
(function(){'use strict';
var U=window.U;if(!U||!U.page)return;
var E=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
var bench=null;
function tm(d){return d?d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';}
function cls(ms,ok,slow){return ms==null?'':ms<=ok?'ok':ms<=slow?'warn':'bad';}
function dev(){var n=navigator,c=n.connection||{};return{cores:n.hardwareConcurrency||'?',mem:n.deviceMemory?n.deviceMemory+' GB':'?',net:c.effectiveType?c.effectiveType+(c.downlink?', ~'+c.downlink+' Mbit/s':'')+(c.rtt?', '+c.rtt+' ms delay':''):'not reported',
 screen:innerWidth+'×'+innerHeight,ua:(n.userAgent.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/)||[''])[0]+(/Mobile|Android/.test(n.userAgent)?' (phone)':'')};}
function runBench(){var t=performance.now(),a=[];for(var i=0;i<300000;i++)a.push((i*7919)%100003);a.sort(function(x,y){return x-y;});var o=[];for(var j=0;j<20000;j++)o.push({id:j,n:'Item '+j,q:j%7});var s=JSON.stringify(o);JSON.parse(s);return Math.round(performance.now()-t);}
function report(){var S=window.UmangSpeed||{sync:[],paint:[]},d=dev(),L=['Umang Speed Check '+new Date().toLocaleString('en-IN'),'Device: '+d.cores+' cores, memory '+d.mem+', network '+d.net+', '+d.ua+', screen '+d.screen,
 'Device test: '+(bench==null?'not run':bench+' ms (reference PC ~150 ms)'),'Saved on device: '+(S.cacheRows||0)+' records, read in '+(S.cacheMs==null?'?':S.cacheMs+' ms'),'','Syncs (newest first): time | lists | server ms | total ms | KB | full lists | changed'];
 S.sync.forEach(function(x){L.push([tm(x.at),x.lists,x.srv,x.ms,x.kb,(x.full||[]).join(' / ')||'-',x.changed].join(' | '));});
 L.push('','Screens drawn (newest first): time | screen | ms');S.paint.forEach(function(x){L.push([tm(x.at),x.page,x.ms].join(' | '));});return L.join('\n');}
U.page('masters.speed-check',function(){
 var S=window.UmangSpeed;
 if(!S)return'<div class="ldx"><p class="mv-note">Speed Check works on the live app only.</p></div>';
 var d=dev(),h='<div class="ldx">';
 h+='<section class="ldx-panel ds-card"><div class="ldx-ph"><div><h2>This device</h2><p>Open the screens that feel slow, then come back here and press <b>Copy report</b> and send it.</p></div></div>'+
  '<div class="ldx-tw"><table class="ldx-t narrow"><tbody>'+
  '<tr><td>Processor cores</td><td>'+E(d.cores)+'</td></tr><tr><td>Memory</td><td>'+E(d.mem)+'</td></tr><tr><td>Internet</td><td>'+E(d.net)+'</td></tr><tr><td>Browser</td><td>'+E(d.ua)+'</td></tr>'+
  '<tr><td>Device test</td><td>'+(bench==null?'<span class="muted">not run</span>':'<span class="ldx-pill '+cls(bench,250,600)+'">'+bench+' ms</span> <span class="muted sm">a fast office PC takes about 150 ms</span>')+'</td></tr>'+
  '<tr><td>Data saved on this device</td><td>'+(S.cacheRows||0).toLocaleString('en-IN')+' records'+(S.cacheMs!=null?', read in '+S.cacheMs+' ms':'')+'</td></tr></tbody></table></div>'+
  '<p class="ds-acts">'+U.btn('spd-bench','','Test this device',true)+' '+U.btn('spd-copy','','Copy report')+' '+U.btn('spd-refresh','','Refresh')+'</p></section>';
 h+='<section class="ldx-panel ds-card"><div class="ldx-ph"><div><h2>Data syncs</h2><p>Each time the app checks the server for changes. <b>Server</b> is the time the server took; <b>Total</b> includes the internet.</p></div></div>';
 if(!S.sync.length)h+='<p class="muted">None yet.</p>';
 else h+='<div class="ldx-tw"><table class="ldx-t"><thead><tr><th>Time</th><th class="num">Lists</th><th class="num">Server</th><th class="num">Total</th><th class="num">Size</th><th>Downloaded in full</th><th class="num">Changed records</th></tr></thead><tbody>'+
  S.sync.map(function(x){return'<tr><td>'+tm(x.at)+'</td><td class="num">'+x.lists+'</td><td class="num"><span class="ldx-pill '+cls(x.srv,500,2000)+'">'+(x.srv||0)+' ms</span></td><td class="num"><span class="ldx-pill '+cls(x.ms,1000,4000)+'">'+(x.ms||0)+' ms</span></td><td class="num">'+(x.kb||0).toLocaleString('en-IN')+' KB</td><td>'+E((x.full||[]).join(', ')||'—')+'</td><td class="num">'+x.changed+'</td></tr>';}).join('')+'</tbody></table></div>';
 h+='</section><section class="ldx-panel ds-card"><div class="ldx-ph"><div><h2>Screens drawn</h2><p>Time to build each screen after you open it or after new data arrives.</p></div></div>';
 if(!S.paint.length)h+='<p class="muted">None yet.</p>';
 else h+='<div class="ldx-tw"><table class="ldx-t narrow"><thead><tr><th>Time</th><th>Screen</th><th class="num">Took</th></tr></thead><tbody>'+
  S.paint.map(function(x){return'<tr><td>'+tm(x.at)+'</td><td>'+E(x.page)+'</td><td class="num"><span class="ldx-pill '+cls(x.ms,300,1000)+'">'+x.ms+' ms</span></td></tr>';}).join('')+'</tbody></table></div>';
 return h+'</section></div>';
});
U.act('spd-bench',function(){bench=null;U.flash('Testing…');setTimeout(function(){bench=runBench();U.paint();},50);});
U.act('spd-refresh',function(){U.paint();});
U.act('spd-copy',function(){var t=report();
 if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(function(){U.flash('Report copied. Paste it in the chat.');},function(){U.flash('Could not copy. Take a screenshot of this page instead.');});
 else U.flash('Copy not available in this browser.');});
})();
