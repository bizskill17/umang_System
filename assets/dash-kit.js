/* Shared dashboard kit: the Lead Dashboard look (period control, tiles, stage board, charts, bar lists, tables)
   plus a Dashboard Settings page per module with section checkboxes and stage targets. */
(function(){'use strict';
var U=window.U,E=U.esc,n=function(v){return Number(v)||0;};
var DK=window.DK={E:E,n:n,defs:{}};
DK.money=function(v){return(U.inr(Math.round(n(v)))||'₹0').replace(/\.00$/,'');};
DK.short=function(v){v=Math.round(n(v));var neg=v<0;v=Math.abs(v);var s=v>=1e7?'₹'+(v/1e7).toFixed(v>=1e8?0:2).replace(/\.?0+$/,'')+' Cr':v>=1e5?'₹'+(v/1e5).toFixed(v>=1e6?1:2).replace(/\.?0+$/,'')+' L':DK.money(v);return(neg?'−':'')+s;};
DK.today=function(){return U.today();};
DK.iso=function(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);};
DK.day=function(x){if(!x)return'';x=String(x);return /T/.test(x)?DK.iso(new Date(x)):x.slice(0,10);};
DK.addDays=function(s,k){var d=new Date(s+'T00:00:00');d.setDate(d.getDate()+k);return DK.iso(d);};
DK.days=function(a,b){if(!a)return 0;var x=Date.parse(DK.day(a)+'T00:00:00Z'),y=Date.parse(DK.day(b||DK.today())+'T00:00:00Z');return isFinite(x)&&isFinite(y)?Math.max(0,Math.round((y-x)/864e5)):0;};
DK.hrs=function(a,b){var x=Date.parse(a),y=b?Date.parse(b):Date.now();return isFinite(x)&&isFinite(y)?Math.max(0,(y-x)/36e5):null;};
DK.pct=function(a,b){return b?Math.round(a/b*100)+'%':'–';};
DK.plural=function(k,w,same){return k+' '+w+(k===1||same?'':'s');};
DK.fmtD=function(d,exact){if(exact){var h=d*24;if(h<1)return'under 1 h';if(h<48)return Math.round(h)+' h';}d=Math.floor(d);return d<1?'today':DK.plural(d,'day');};
DK.fmtH=function(h){return h==null?'–':h<1?Math.max(1,Math.round(h*60))+' min':h<48?(Math.round(h*10)/10)+' h':(Math.round(h/24*10)/10)+' days';};
DK.tgt=function(d){return d<1?Math.round(d*24)+' h':(d%1?d+' days':DK.plural(d,'day'));};
DK.sum=function(a,f){return a.reduce(function(t,x){return t+n(f?f(x):x);},0);};
DK.user=function(id){return id==='server-owner'?'Administrator':U.user(id)||'';};
DK.ICON={warn:'<svg class="i" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2 14.3 13H1.7L8 2.2Z"/><path d="M8 6.6v3M8 11.6v.1"/></svg>',check:'<svg class="i" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8.4 3.2 3.1L13 4.6"/></svg>',clock:'<svg class="i" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.2 1.4"/></svg>',up:'<svg class="i" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3 13.5 11h-11L8 3Z"/></svg>',down:'<svg class="i" viewBox="0 0 16 16" fill="currentColor"><path d="M8 13 2.5 5h11L8 13Z"/></svg>'};
DK.pill=function(kind,text,icon){return'<span class="ldx-pill '+kind+'">'+(icon?DK.ICON[icon]:'')+text+'</span>';};
DK.rating=function(p,count,min){if(p==null||count<(min||5))return DK.pill('neutral','Too few yet');if(p>=85)return DK.pill('ok','On target','check');if(p>=70)return DK.pill('warn','Watch','warn');return DK.pill('bad','Needs attention','warn');};
DK.ontime=function(p){return p==null?'<span class="muted">–</span>':'<div class="ldx-ot"><div class="trk"><div class="fill" style="width:'+p+'%"></div><div class="tgt" style="left:85%"></div></div><b>'+p+'%</b></div>';};
// ----- period -----
DK.PERIODS=[['today','Today'],['7','7 days'],['30','30 days'],['90','90 days'],['mtd','This month'],['all','All time']];
DK.range=function(k){var t=DK.today();if(k==='all')return null;if(k==='today')return{from:t,to:t,pf:DK.addDays(t,-1),pt:DK.addDays(t,-1)};
 if(k==='mtd'){var f=t.slice(0,8)+'01',d=new Date(f+'T00:00:00');d.setMonth(d.getMonth()-1);var pf=DK.iso(d);return{from:f,to:t,pf:pf,pt:DK.addDays(pf,DK.days(f,t))};}
 var nn=Number(k)||30;return{from:DK.addDays(t,-(nn-1)),to:t,pf:DK.addDays(t,-(2*nn-1)),pt:DK.addDays(t,-nn)};};
// ----- building blocks -----
DK.panel=function(id,title,sub,body,tools){var x=body.indexOf('<table')>-1;if(x)tools='<div class="ldx-tools">'+(tools||'')+U.excelButton()+'</div>';return'<section class="ldx-panel"'+(x?' data-export':'')+' aria-labelledby="ldx-'+id+'"><div class="ldx-ph"><div><h2 id="ldx-'+id+'">'+E(title)+'</h2>'+(sub?'<p>'+sub+'</p>':'')+'</div>'+(tools||'')+'</div>'+body+'</section>';};
DK.grid=function(list){list=list.filter(Boolean);return list.length?'<div class="ldx-g'+Math.min(list.length,3)+'">'+list.join('')+'</div>':'';};
DK.seg=function(act,cur,opts,label){return'<div class="ldx-seg" role="group" aria-label="'+E(label)+'">'+opts.map(function(o){return'<button type="button" data-a="'+act+'" data-id="'+o[0]+'" aria-pressed="'+(String(cur)===o[0])+'">'+E(o[1])+'</button>';}).join('')+'</div>';};
DK.empty=function(text,ok){return'<div class="ldx-empty">'+(ok?DK.pill('ok','Clear','check'):'')+'<span'+(ok?'':' class="muted"')+'>'+E(text)+'</span></div>';};
// items: {k, n, x?, tip?, late?}; head: optional [count label, extra label]
DK.bars=function(items,head){var max=Math.max.apply(null,items.map(function(i){return n(i.w!=null?i.w:i.n);}).concat([1]));return(head?'<div class="ldx-blh"><span></span><span></span><span>'+E(head[0])+'</span><span>'+E(head[1]||'')+'</span></div>':'')+'<div class="ldx-bl">'+items.map(function(i){var w=n(i.w!=null?i.w:i.n);return'<div class="ldx-bli"><span class="bk" title="'+E(i.k)+'">'+E(i.k)+'</span><span class="bt"><i'+(i.late?' class="late"':'')+' style="width:'+(w/max*100)+'%" title="'+E(i.k)+(i.tip?': '+E(i.tip):'')+'"></i></span><span class="bn">'+(i.nl!=null?i.nl:i.n)+'</span>'+(i.x!==undefined?'<span class="bx">'+i.x+'</span>':'<span></span>')+'</div>';}).join('')+'</div>';};
DK.tile=function(slug,label,val,sub,route,ids,bad){var key=slug+'|dk'+label.replace(/\W/g,'');if(ids)U.kpiSets[key]={key:slug+'.'+route,only:ids,label:label};
 return'<a class="kpi ldx-tile" href="#'+slug+'.'+route+'"'+(ids?' data-kpi="'+key+'"':'')+'><div class="t-label">'+E(label)+'</div><div class="t-val'+(bad?' bad':'')+'">'+val+'</div><div class="t-sub">'+sub+'</div></a>';};
DK.tiles=function(list){return'<section class="ldx-tiles" aria-label="Key numbers">'+list.join('')+'</section>';};
DK.delta=function(cur,prev,R,extra){if(!R)return'<span>'+(extra||'whole record')+'</span>';if(!prev)return'<span>'+(extra?extra+' · ':'')+'no earlier data</span>';var d=Math.round((cur-prev)/prev*100);return(d>=0?'<span class="up">'+DK.ICON.up+Math.abs(d)+'%</span>':'<span class="down">'+DK.ICON.down+Math.abs(d)+'%</span>')+'<span>vs previous'+(extra?' · '+extra:'')+'</span>';};
// cols: [[head, fn(row), cls]]; cls 'num' right-aligns
DK.table=function(cols,rows,empty,wrap){return'<div class="ldx-tw"><table class="ldx-t'+(wrap?' wrap':'')+(cols.length<=5?' narrow':'')+'"><thead><tr>'+cols.map(function(c){return'<th'+(c[2]?' class="'+c[2]+'"':'')+'>'+c[0]+'</th>';}).join('')+'</tr></thead><tbody>'+(rows.length?'':'<tr><td colspan="'+cols.length+'">'+(typeof empty==='string'&&empty.indexOf('<')===0?empty:DK.empty(empty||'Nothing to show for these filters.',true))+'</td></tr>')+rows.map(function(r,i){return'<tr>'+cols.map(function(c){return'<td'+(c[2]?' class="'+c[2]+'"':'')+'>'+c[1](r,i)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';};
// Stage board: rows {k,name,note,a:[items], od:n, oldest, exact, value}
DK.board=function(st,rows,opt){opt=opt||{};var max=Math.max.apply(null,rows.map(function(x){return x.a.length;}).concat([1]));
 return'<div class="ldx-legend"><span><i class="sw ok"></i>'+(opt.okLabel||'Inside target')+'</span><span><i class="sw od"></i>'+(opt.odLabel||'Overdue')+'</span></div>'+rows.map(function(x){var c=x.a.length,okW=(c-x.od)/max*100,odW=x.od/max*100,bits=[x.note];if(x.target)bits.push('target '+DK.tgt(x.target));if(c&&x.oldest!=null)bits.push('oldest '+DK.fmtD(x.oldest,x.exact));if(c&&x.value)bits.push(DK.short(x.value));
  return'<button type="button" class="ldx-srow" data-a="dk-stage" data-id="'+x.k+'" aria-pressed="'+(st.stage===x.k)+'"><span class="s-name">'+E(x.name)+'<small>'+E(bits.filter(Boolean).join(' · '))+'</small></span><span class="s-bar" aria-hidden="true">'+(c-x.od?'<i class="ok" style="width:'+okW+'%"></i>':'')+(x.od?'<i class="od" style="width:'+odW+'%"></i>':'')+'</span><span class="s-num"><b>'+c+'</b>'+(x.od?'<em>'+x.od+' overdue</em>':'<span class="muted">'+(c?'on time':'none')+'</span>')+'</span></button>';}).join('');};
DK.stageChip=function(st,name){return st.stage?' · <button type="button" class="ldx-chip" data-a="dk-stage" data-id="'+E(st.stage)+'">'+E(name)+' ×</button>':'';};
DK.listTools=function(st){return DK.seg('dk-view',st.view||'overdue',[['overdue','Overdue'],['all','All open']],'Which records');};
DK.more=function(st,list,limit){return list.length>(limit||10)?'<button type="button" class="ldx-link" data-a="dk-showall">'+(st.showAll?'Show fewer':'Show all '+list.length)+'</button>':'';};
DK.cut=function(st,list,limit){return st.showAll?list:list.slice(0,limit||10);};
DK.latePill=function(over,exact,left){return over>0?DK.pill('bad',DK.fmtD(over,exact)+' over','warn'):DK.pill('neutral',left!=null&&left>0?DK.fmtD(left,exact)+' left':'due today','clock');};
// ----- time chart -----
function buckets(mode){var t=DK.today(),out=[],i,s,MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 if(mode==='day'){for(i=29;i>=0;i--){s=DK.addDays(t,-i);out.push({s:s,e:s,lab:String(+s.slice(8)),tip:U.dmy(s),partial:i===0});}}
 else if(mode==='week'){var wd=(new Date(t+'T00:00:00').getDay()+6)%7,w0=DK.addDays(t,-wd);for(i=11;i>=0;i--){s=DK.addDays(w0,-7*i);out.push({s:s,e:DK.addDays(s,6),lab:+s.slice(8)+' '+MON[+s.slice(5,7)-1],tip:'Week of '+U.dmy(s),partial:i===0});}}
 else{for(i=11;i>=0;i--){var d=new Date(t.slice(0,8)+'01T00:00:00');d.setMonth(d.getMonth()-i);s=DK.iso(d);var e=new Date(d);e.setMonth(e.getMonth()+1);e.setDate(0);out.push({s:s,e:DK.iso(e),lab:MON[d.getMonth()],tip:MON[d.getMonth()]+' '+d.getFullYear(),partial:i===0});}}
 return out;}
function barPath(x,y,w,h){var r=Math.min(4,w/2,h);return'M'+x+','+(y+h)+'V'+(y+r)+'Q'+x+','+y+' '+(x+r)+','+y+'H'+(x+w-r)+'Q'+(x+w)+','+y+' '+(x+w)+','+(y+r)+'V'+(y+h)+'Z';}
// series: [{name, rows, date:fn, value:fn|undefined, cls}] — one or two series. opt.money: bar height is ₹.
DK.chart=function(st,id,title,series,opt){opt=opt||{};var key='vol_'+id,mode=st[key]||opt.mode||'day',bs=buckets(mode),unit=mode==='day'?'day':mode==='week'?'week':'month';
 series.forEach(function(se){se.b=bs.map(function(b){var rs=se.rows.filter(function(r){var d=se.date(r);return d&&d>=b.s&&d<=b.e;});return{n:rs.length,v:DK.sum(rs,se.value||function(){return 0;})};});});
 var useV=opt.money||opt.sum,val=function(se,i){return useV?se.b[i].v:se.b[i].n;},fmt=function(v){return opt.money?DK.short(v):String(Math.round(v*10)/10);};
 var s0=series[0],done=bs.length-1,avg=s0.b.slice(0,-1).reduce(function(a,x,i){return a+val(s0,i);},0)/Math.max(done,1),last=val(s0,bs.length-1);
 var meta=opt.sub||(s0.name+': average '+fmt(Math.round(avg*10)/10)+' per '+unit+' · '+(mode==='day'?'today':'this '+unit)+' so far '+fmt(last));
 var tools='<div class="ldx-tools">'+DK.seg('dk-vol',mode,[['day','Daily'],['week','Weekly'],['month','Monthly']],'Group by').replace(/data-a="dk-vol" data-id="(\w+)"/g,'data-a="dk-vol" data-id="'+id+':$1"')+'<div class="ldx-seg"><button type="button" data-a="dk-voltable" data-id="'+id+'" aria-pressed="'+!!st['t_'+id]+'">Table</button></div></div>';
 var body;
 if(st['t_'+id])body=DK.table([[mode==='day'?'Day':mode==='week'?'Week':'Month',function(b){return E(b.tip)+(b.partial?' <span class="muted">(so far)</span>':'');}]].concat(series.map(function(se){return[E(se.name),function(b){var i=bs.indexOf(b);return opt.sum?se.b[i].v:se.b[i].n+(se.value?' · '+DK.money(se.b[i].v):'');},'num'];})),bs.slice().reverse());
 else{var W=560,Ht=230,m={l:opt.money?52:30,r:6,t:20,b:26},iw=W-m.l-m.r,ih=Ht-m.t-m.b,mx=1;series.forEach(function(se){bs.forEach(function(b,i){mx=Math.max(mx,val(se,i));});});mx=Math.max(mx,avg);
  var steps=[1,2,5,10,20,50,100,200,500,1000,2000,5000,1e4,2e4,5e4,1e5,2e5,5e5,1e6,2e6,5e6,1e7,2e7,5e7,1e8],step=1;for(var q=0;q<steps.length;q++){step=steps[q];if(mx/step<=4)break;}
  var top=Math.ceil(mx/step)*step,y=function(v){return m.t+ih-(v/top)*ih;},g='',b2='';
  for(var v=0;v<=top;v+=step)g+='<line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+y(v)+'" y2="'+y(v)+'" class="'+(v===0?'ax':'gr')+'"/><text x="'+(m.l-6)+'" y="'+(y(v)+4)+'" text-anchor="end">'+(opt.money?DK.short(v).replace('₹',''):v)+'</text>';
  var slot=iw/bs.length,k=series.length,bw=Math.max(3,Math.min(slot*.62/k,30)),every=Math.ceil(bs.length*(mode==='week'?50:26)/iw);
  bs.forEach(function(b,i){series.forEach(function(se,j){var vv=val(se,i),x=m.l+slot*i+(slot-bw*k)/2+bw*j,h=(vv/top)*ih;if(vv>0)b2+='<path d="'+barPath(x,y(vv),bw,h)+'" class="bar'+(j?' b2':'')+'"'+(b.partial?' fill-opacity=".55"':'')+'/>';});
   if((bs.length-1-i)%every===0)b2+='<text x="'+(m.l+slot*i+slot/2)+'" y="'+(Ht-8)+'" text-anchor="middle">'+E(b.lab)+'</text>';
   b2+='<rect x="'+(m.l+slot*i)+'" y="'+m.t+'" width="'+slot+'" height="'+ih+'" fill="transparent"><title>'+E(b.tip+(b.partial?' (so far)':'')+': '+series.map(function(se){return se.name+' '+(opt.money?DK.money(se.b[i].v):opt.sum?se.b[i].v:se.b[i].n)+(se.value&&!useV?' · '+DK.money(se.b[i].v):'');}).join(' · '))+'</title></rect>';});
  if(k===1){var lx=m.l+slot*(bs.length-1)+slot/2,ay=y(avg);b2+='<text class="val" x="'+lx+'" y="'+(y(last)-6)+'" text-anchor="middle">'+fmt(last)+'</text><line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+ay+'" y2="'+ay+'" class="avg"/>';}
  body='<div class="ldx-chart"><svg viewBox="0 0 '+W+' '+Ht+'" role="img" aria-label="'+E(title)+' per '+unit+'">'+g+b2+'</svg></div><div class="ldx-legend">'+series.map(function(se,j){return'<span><i class="sw '+(j?'b2':'ok')+'"></i>'+E(se.name)+'</span>';}).join('')+(k===1?'<span><i class="sw avgl"></i>Average</span>':'')+'</div>';}
 return DK.panel(id,title,meta,body,tools);};
// ----- settings -----
DK.settings=function(slug){return U.rows('app_settings').find(function(r){return r.key===slug+'-dashboard';})||null;};
DK.on=function(slug,k){var s=DK.settings(slug);return!s||!s.sections||s.sections[k]!==false;};
DK.target=function(slug,k){var d=DK.defs[slug],t=((DK.settings(slug)||{}).targets||{})[k],def=((d&&d.targets)||[]).find(function(x){return x.k===k;});var v=Number(t);return v>0?v:def?def.def:0;};
DK.define=function(slug,cfg){DK.defs[slug]=cfg;
 U.page(slug+'.dashboard',function(){
  if(!U.base(['app_settings'].concat(cfg.need||[])))return U.loading;
  var st=U.st();if(!st.period)st.period=cfg.period||'30';if(!st.view)st.view='overdue';
  var R=DK.range(st.period),ctx={slug:slug,st:st,R:R,t:DK.today(),on:function(k){return DK.on(slug,k);},T:function(k){return DK.target(slug,k);},
   inP:function(d){d=DK.day(d);return!R||(!!d&&d>=R.from&&d<=R.to);},inPrev:function(d){d=DK.day(d);return!!R&&!!d&&d>=R.pf&&d<=R.pt;}};
  ctx.pname=R?'period':'whole record';
  var html='<div class="ldx"><header class="ldx-top"><div><div class="ldx-eyebrow">'+E(cfg.eyebrow||'')+'</div><h1>'+E(cfg.title)+'</h1><div class="ldx-sub">'+E(new Date().toLocaleString('en-IN',{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit'}))+(cfg.subline?' · '+E(cfg.subline):'')+'</div></div>'+DK.seg('dk-period',st.period,DK.PERIODS,'Reporting period')+'</header>';
  var f=cfg.filters?cfg.filters(st):[];html+='<div class="ldx-filters">'+U.bar(st,f,false)+'</div>';
  var body='';try{body=cfg.render(ctx);}catch(e){console.error(e);body='<p class="mv-note">Part of this dashboard could not be drawn. Reload the page; if it stays, tell the admin.</p>';}
  if(!(cfg.sections||[]).some(function(s){return ctx.on(s[0]);}))body+='<p class="mv-note">All sections are switched off. Turn them on in <a href="#'+slug+'.dashboard-settings">Dashboard Settings</a>.</p>';
  return html+body+'</div>';});
 U.page(slug+'.dashboard-settings',function(){
  if(!U.base(['app_settings']))return U.loading;
  var s=DK.settings(slug),ro=U.ro(),dis=ro?' disabled':'';
  return'<div class="ldx"><section class="ldx-panel ds-card"><div class="ldx-ph"><div><h2>'+E(cfg.title)+' sections</h2><p>Tick the sections the '+E(cfg.title)+' should show. This applies to everyone.</p></div></div><ul class="ds-list">'+(cfg.sections||[]).map(function(x){return'<li><label class="ds-row"><input type="checkbox" class="ds-cb" data-k="'+x[0]+'"'+(DK.on(slug,x[0])?' checked':'')+dis+'><span><b>'+E(x[1])+'</b><small>'+E(x[2])+'</small></span></label></li>';}).join('')+'</ul>'+
   ((cfg.targets||[]).length?'<div class="ldx-ph ds-sub"><div><h2>Targets</h2><p>How long each step may take before it counts as overdue, in days. Use decimals for hours: 0.5 = 12 hours.</p></div></div><div class="ds-targets">'+cfg.targets.map(function(x){return'<label class="ds-tg"><span><b>'+E(x.name)+'</b><small>'+E(x.note||'')+(x.note?' · ':'')+'default '+DK.tgt(x.def)+'</small></span><span class="ds-in"><input type="number" class="ds-t" data-k="'+x.k+'" data-def="'+x.def+'" min="0.05" step="0.05" value="'+DK.target(slug,x.k)+'"'+dis+'><em>days</em></span></label>';}).join('')+'</div>':'')+
   (ro?'':'<p class="ds-acts">'+((cfg.targets||[]).length?U.btn('dk-reset','','Default targets'):'')+U.btn('dk-all','','Select all sections')+U.btn('dk-save',slug,'Save',true)+'</p>')+(s&&s.updatedAt?'<p class="muted sm">Last changed '+U.dmy(String(s.updatedAt).slice(0,10))+(s.by?' by '+E(DK.user(s.by)):'')+'.</p>':'')+'</section></div>';});};
U.act('dk-period',function(v){U.st().period=v;U.paint();});
U.act('dk-view',function(v){var s=U.st();s.view=v;s.showAll=false;U.paint();});
U.act('dk-vol',function(v){var p=String(v).split(':');U.st()['vol_'+p[0]]=p[1];U.paint();});
U.act('dk-voltable',function(id){var s=U.st();s['t_'+id]=!s['t_'+id];U.paint();});
U.act('dk-stage',function(v){var s=U.st();s.stage=s.stage===v?'':v;s.showAll=false;U.paint();var el=document.getElementById('ldx-list');if(s.stage&&el)el.scrollIntoView({behavior:'smooth',block:'start'});});
U.act('dk-showall',function(){var s=U.st();s.showAll=!s.showAll;U.paint();});
U.act('dk-all',function(){document.querySelectorAll('.ds-cb').forEach(function(c){c.checked=true;});});
U.act('dk-reset',function(){document.querySelectorAll('.ds-t').forEach(function(c){c.value=c.dataset.def;});});
U.act('dk-save',async function(slug){var sec={},tg={},bad='';document.querySelectorAll('.ds-cb').forEach(function(c){sec[c.dataset.k]=c.checked;});
 document.querySelectorAll('.ds-t').forEach(function(c){var v=Number(c.value);if(!(v>0)||v>365)bad=bad||c.closest('.ds-tg').querySelector('b').textContent;else tg[c.dataset.k]=Math.round(v*100)/100;});
 if(bad){U.flash('Enter a target above 0 days for '+bad+'.');return;}
 var s=DK.settings(slug),me=U.meId();
 try{if(s)await U.upd('app_settings',s.id,{sections:sec,targets:tg,by:me});else await U.add('app_settings',{key:slug+'-dashboard',sections:sec,targets:tg,by:me});U.flash('Dashboard settings saved.');}catch(e){U.flash((e&&(e.msg||e.message))||'Could not save the settings.');}});
})();
