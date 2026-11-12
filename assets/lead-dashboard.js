/* Lead Dashboard, built around the lead → quotation flow. Sections are switched on or off in Leads › Dashboard Settings. */
(function(){'use strict';
var U=window.U,E=U.esc,n=function(v){return Number(v)||0;};
var SECTIONS=[['kpis','Headline numbers','Leads received, without quotation, in progress, waiting for client, won, lost, overdue'],['waiting','Where open leads are waiting','Open leads at each stage, inside target or overdue; select a stage to filter the action list'],['volume','New leads received','Daily, weekly or monthly chart of leads received'],['funnel','Lead → Quotation funnel','How many leads reach each stage, and where they drop out'],['ageing','Quotation ageing','Sent quotations waiting for the client, by days since sending'],['actions','Leads that need action','Overdue or all open leads, longest wait first'],['team','Team performance','Per assignee: leads, quotations sent, won, conversion, overdue'],['source','Source and category','Which sources and categories bring business that converts'],['lost','Lost analysis','Rejected quotations and canceled leads with their reasons']];
var SKEY='lead-dashboard';
function settings(){return U.rows('app_settings').find(function(r){return r.key===SKEY;})||null;}
function on(k){var s=settings();return!s||!s.sections||s.sections[k]!==false;}
function money(v){return(U.inr(Math.round(n(v)))||'₹0').replace(/\.00$/,'');}
function short(v){v=Math.round(n(v));if(v>=1e7)return'₹'+(v/1e7).toFixed(v>=1e8?0:2).replace(/\.?0+$/,'')+' Cr';if(v>=1e5)return'₹'+(v/1e5).toFixed(v>=1e6?1:2).replace(/\.?0+$/,'')+' L';return money(v);}
function today(){return U.today();}
function iso(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function addDays(s,k){var d=new Date(s+'T00:00:00');d.setDate(d.getDate()+k);return iso(d);}
function days(a,b){if(!a)return 0;var x=Date.parse(String(a).slice(0,10)+'T00:00:00Z'),y=Date.parse(String(b||today()).slice(0,10)+'T00:00:00Z');return isFinite(x)&&isFinite(y)?Math.max(0,Math.round((y-x)/864e5)):0;}
function pct(a,b){return b?Math.round(a/b*100)+'%':'–';}
function plural(k,w){return k+' '+w+(k===1?'':'s');}
function fmtD(d){return d<1?'today':plural(d,'day');}
var ICON={warn:'<svg class="i" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2 14.3 13H1.7L8 2.2Z"/><path d="M8 6.6v3M8 11.6v.1"/></svg>',check:'<svg class="i" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8.4 3.2 3.1L13 4.6"/></svg>',clock:'<svg class="i" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.2 1.4"/></svg>',up:'<svg class="i" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3 13.5 11h-11L8 3Z"/></svg>',down:'<svg class="i" viewBox="0 0 16 16" fill="currentColor"><path d="M8 13 2.5 5h11L8 13Z"/></svg>'};
// The lead's live quotation: the newest one that isn't canceled.
function quoteOf(l,qs){var mine=qs.filter(function(q){return q.lead_id===l.id;}).sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''));});return mine.find(function(q){return q.status!=='Canceled';})||null;}
// Stage, who works it, target days (from the Lead SOP) and the list that works it.
var STAGES=[
 {k:'unassigned',name:'Unassigned',note:'Lead owner to assign',target:1,route:'pending-assignee'},
 {k:'noquote',name:'Assigned, no quotation yet',note:'Assignee',target:3,route:'pending-follow-ups'},
 {k:'prepare',name:'Quotation to prepare',note:'Quotation team',target:2,route:'prepare-quotation'},
 {k:'check',name:'Prepared, to check',note:'Checker',target:1,route:'checking'},
 {k:'send',name:'Checked, to send',note:'Sales',target:1,route:'sending'},
 {k:'client',name:'Sent, waiting for client',note:'Sales follow-up',target:3,route:'client-approval'},
 {k:'rejected',name:'Rejected, to revise or cancel',note:'Sales',target:3,route:'quotation-follow-ups'},
 {k:'project',name:'Approved, project to create',note:'Projects',target:1,route:'pending-create-project'},
 {k:'won',name:'Project created (won)',target:0,route:'completed'},
 {k:'lost',name:'Lead canceled (lost)',target:0,route:'canceled'}];
var SBY={};STAGES.forEach(function(s){SBY[s.k]=s;});
var OPEN_STAGES=STAGES.filter(function(s){return s.target>0;});
function stageOf(l,q){
 if(l.status==='Canceled')return{k:'lost',since:l.canceled_at||l.date};
 if(!q)return l.assigned_to?{k:'noquote',since:l.date}:{k:'unassigned',since:l.date};
 var s=q.status;
 if(s==='Pending Prepare Quotation')return{k:'prepare',since:q.assigned_date||l.date};
 if(s==='Pending Checking')return{k:'check',since:q.date||q.assigned_date};
 if(s==='Pending Sending')return{k:'send',since:(q.checked||{}).date||q.date};
 if(s==='Pending Approval')return{k:'client',since:(q.sent||{}).date||q.date};
 if(s==='Rejected')return{k:'rejected',since:q.rejected_at||q.date};
 if(s==='Approved')return q.project_id?{k:'won',since:q.approved_at}:{k:'project',since:q.approved_at};
 return l.assigned_to?{k:'noquote',since:l.date}:{k:'unassigned',since:l.date};}
function nextDue(l,q){var a=(l.last_fu||{}).next_date||'',b=q&&q.status==='Pending Approval'?q.next_fu||'':'';return[a,b].filter(Boolean).sort()[0]||'';}
// Reporting period: received date of the lead.
var PERIODS=[['today','Today'],['7','7 days'],['30','30 days'],['90','90 days'],['mtd','This month'],['all','All time']];
function range(k){var t=today();if(k==='all')return null;if(k==='today')return{from:t,to:t,pf:addDays(t,-1),pt:addDays(t,-1)};
 if(k==='mtd'){var f=t.slice(0,8)+'01',d=new Date(f+'T00:00:00');d.setMonth(d.getMonth()-1);var pf=iso(d);return{from:f,to:t,pf:pf,pt:addDays(pf,days(f,t))};}
 var nn=Number(k)||30;return{from:addDays(t,-(nn-1)),to:t,pf:addDays(t,-(2*nn-1)),pt:addDays(t,-nn)};}
function rowsFor(st){
 var qs=U.rows('quotations'),t=today();
 return U.rows('leads').filter(function(l){return(!st.firm||l.firm_id===st.firm)&&(!st.owner||l.owner_id===st.owner)&&(!st.who||l.assigned_to===st.who)&&(!st.src||l.lead_source_id===st.src)&&(!st.cat||l.lead_category_id===st.cat)&&(!st.cust||l.customer_id===st.cust)&&U.match({q:st.q},[l.lead_no,U.nm('customers',l.customer_id),l.remarks].join(' '),l.date);}).map(function(l){
  var q=quoteOf(l,qs),sg=stageOf(l,q),age=days(sg.since,t),tg=SBY[sg.k].target,due=nextDue(l,q),late=due&&due<t?days(due,t):0;
  return{l:l,q:q,stage:sg.k,since:sg.since,age:age,target:tg,over:tg>0?Math.max(0,age-tg):0,value:q&&n(q.total)?n(q.total):n(l.estimate),due:due,late:late,
   open:sg.k!=='won'&&sg.k!=='lost',sent:!!(q&&(q.sent||q.status==='Pending Approval'||q.status==='Approved'||q.status==='Rejected')),won:!!(q&&q.status==='Approved'),date:String(l.date||(l.createdAt||'')).slice(0,10)};});}
function isLate(r){return r.open&&(r.over>0||r.late>0);}
function lateBy(r){return Math.max(r.over,r.late);}
function sum(a){return a.reduce(function(x,r){return x+r.value;},0);}
function panel(id,title,sub,body,tools){var x=body.indexOf('<table')>-1;if(x)tools='<div class="ldx-tools">'+(tools||'')+U.excelButton()+'</div>';return'<section class="ldx-panel"'+(x?' data-export':'')+' aria-labelledby="ldx-'+id+'"><div class="ldx-ph"><div><h2 id="ldx-'+id+'">'+E(title)+'</h2>'+(sub?'<p>'+sub+'</p>':'')+'</div>'+(tools||'')+'</div>'+body+'</section>';}
function seg(act,cur,opts,label){return'<div class="ldx-seg" role="group" aria-label="'+E(label)+'">'+opts.map(function(o){return'<button type="button" data-a="'+act+'" data-id="'+o[0]+'" aria-pressed="'+(String(cur)===o[0])+'">'+E(o[1])+'</button>';}).join('')+'</div>';}
function bars(items,max){return'<div class="ldx-bl">'+items.map(function(i){return'<div class="ldx-bli"><span class="bk" title="'+E(i.k)+'">'+E(i.k)+'</span><span class="bt"><i'+(i.late?' class="late"':'')+' style="width:'+(max?i.n/max*100:0)+'%" title="'+E(i.k)+': '+E(i.tip||plural(i.n,'lead'))+'"></i></span><span class="bn">'+i.n+'</span>'+(i.x!==undefined?'<span class="bx">'+i.x+'</span>':'')+'</div>';}).join('')+'</div>';}
function tile(label,val,sub,route,rows,bad){var key='leads|ldx'+label.replace(/\W/g,'');if(rows)U.kpiSets[key]={key:'leads.'+route,only:rows.map(function(r){return r.l.id;}),label:label};
 return'<a class="kpi ldx-tile" href="#leads.'+route+'"'+(rows?' data-kpi="'+key+'"':'')+'><div class="t-label">'+E(label)+'</div><div class="t-val'+(bad?' bad':'')+'">'+val+'</div><div class="t-sub">'+sub+'</div></a>';}
// ---------- volume chart ----------
function buckets(mode,R){var t=today(),out=[],i,s;var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 if(mode==='day'){for(i=29;i>=0;i--){s=addDays(t,-i);out.push({s:s,e:s,lab:String(+s.slice(8)),tip:U.dmy(s),partial:i===0});}}
 else if(mode==='week'){var wd=(new Date(t+'T00:00:00').getDay()+6)%7,w0=addDays(t,-wd);for(i=11;i>=0;i--){s=addDays(w0,-7*i);out.push({s:s,e:addDays(s,6),lab:+s.slice(8)+' '+MON[+s.slice(5,7)-1],tip:'Week of '+U.dmy(s),partial:i===0});}}
 else{for(i=5;i>=0;i--){var d=new Date(t.slice(0,8)+'01T00:00:00');d.setMonth(d.getMonth()-i);s=iso(d);var e=new Date(d);e.setMonth(e.getMonth()+1);e.setDate(0);out.push({s:s,e:iso(e),lab:MON[d.getMonth()],tip:MON[d.getMonth()]+' '+d.getFullYear(),partial:i===0});}}
 out.forEach(function(b){b.rows=R.filter(function(r){return r.date>=b.s&&r.date<=b.e;});b.n=b.rows.length;});return out;}
function barPath(x,y,w,h){var r=Math.min(4,w/2,h);return'M'+x+','+(y+h)+'V'+(y+r)+'Q'+x+','+y+' '+(x+r)+','+y+'H'+(x+w-r)+'Q'+(x+w)+','+y+' '+(x+w)+','+(y+r)+'V'+(y+h)+'Z';}
function volume(st,R){var mode=st.vol||'day',bs=buckets(mode,R),unit=mode==='day'?'day':mode==='week'?'week':'month',done=bs.slice(0,-1),avg=done.reduce(function(a,b){return a+b.n;},0)/Math.max(done.length,1),last=bs[bs.length-1];
 var meta='Average '+avg.toFixed(1)+' per '+unit+' · '+(mode==='day'?'today':'this '+unit)+' so far '+last.n;
 var tools='<div class="ldx-tools">'+seg('ldx-vol',mode,[['day','Daily'],['week','Weekly'],['month','Monthly']],'Group by')+'<div class="ldx-seg"><button type="button" data-a="ldx-voltable" aria-pressed="'+!!st.volTable+'">Table</button></div></div>';
 var body;
 if(st.volTable)body='<div class="ldx-tw"><table class="ldx-t" style="min-width:260px"><thead><tr><th>'+(mode==='day'?'Day':mode==='week'?'Week':'Month')+'</th><th class="num">Leads</th><th class="num">Value</th></tr></thead><tbody>'+bs.slice().reverse().map(function(b){return'<tr><td>'+E(b.tip)+(b.partial?' <span class="muted">(so far)</span>':'')+'</td><td class="num">'+b.n+'</td><td class="num">'+money(sum(b.rows))+'</td></tr>';}).join('')+'</tbody></table></div>';
 else{var W=560,Ht=230,m={l:30,r:6,t:20,b:26},iw=W-m.l-m.r,ih=Ht-m.t-m.b,mx=Math.max.apply(null,bs.map(function(b){return b.n;}).concat([avg,1])),steps=[1,2,5,10,20,50,100,200,500],step=1;
  for(var q=0;q<steps.length;q++){step=steps[q];if(mx/step<=4)break;}
  var top=Math.ceil(mx/step)*step,y=function(v){return m.t+ih-(v/top)*ih;},g='',b2='';
  for(var v=0;v<=top;v+=step)g+='<line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+y(v)+'" y2="'+y(v)+'" class="'+(v===0?'ax':'gr')+'"/><text x="'+(m.l-6)+'" y="'+(y(v)+4)+'" text-anchor="end">'+v+'</text>';
  var slot=iw/bs.length,bw=Math.max(3,Math.min(slot*.62,36)),every=Math.ceil(bs.length*(mode==='week'?50:26)/iw);
  bs.forEach(function(b,i){var x=m.l+slot*i+(slot-bw)/2,h=(b.n/top)*ih;if(b.n>0)b2+='<path d="'+barPath(x,y(b.n),bw,h)+'" class="bar"'+(b.partial?' fill-opacity=".55"':'')+'/>';
   if((bs.length-1-i)%every===0)b2+='<text x="'+(x+bw/2)+'" y="'+(Ht-8)+'" text-anchor="middle">'+E(b.lab)+'</text>';
   b2+='<rect x="'+(m.l+slot*i)+'" y="'+m.t+'" width="'+slot+'" height="'+ih+'" fill="transparent"><title>'+E(b.tip+(b.partial?' (so far)':'')+': '+plural(b.n,'lead')+' · '+money(sum(b.rows)))+'</title></rect>';});
  var lx=m.l+slot*(bs.length-1)+slot/2,ay=y(avg);
  b2+='<text class="val" x="'+lx+'" y="'+(y(last.n)-6)+'" text-anchor="middle">'+last.n+'</text><line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+ay+'" y2="'+ay+'" class="avg"/>';
  body='<div class="ldx-chart"><svg viewBox="0 0 '+W+' '+Ht+'" role="img" aria-label="Leads received per '+unit+', average '+avg.toFixed(1)+'">'+g+b2+'</svg></div><div class="ldx-legend"><span><i class="sw ok"></i>Leads received</span><span><i class="sw avgl"></i>Average</span></div>';}
 return panel('vol','New leads received',meta,body,tools);}
// ---------- page ----------
U.page('leads.dashboard',function(){
 if(!U.base(['leads','quotations','projects','app_settings',U.m('lead-sources'),U.m('lead-category'),U.m('firm')]))return U.loading;
 var st=U.st();if(!st.period)st.period='30';if(!st.view)st.view='overdue';
 var ALL=rowsFor(st),R=range(st.period),inP=function(r){return!R||(r.date>=R.from&&r.date<=R.to);},C=ALL.filter(inP),PREV=R?ALL.filter(function(r){return r.date>=R.pf&&r.date<=R.pt;}):[];
 var open=ALL.filter(function(r){return r.open;}),late=open.filter(isLate),t=today(),html='';
 var pname=(PERIODS.find(function(p){return p[0]===st.period;})||PERIODS[2])[1].toLowerCase();
 html+='<div class="ldx"><header class="ldx-top"><div><div class="ldx-eyebrow">Sales desk · Lead → Quotation</div><h1>Leads Dashboard</h1><div class="ldx-sub">'+E(new Date().toLocaleString('en-IN',{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit'}))+' · each stage has a target in days, from the Lead SOP</div></div>'+seg('ldx-period',st.period,PERIODS,'Reporting period')+'</header>';
 html+='<div class="ldx-filters">'+U.bar(st,[{k:'firm',label:'Firm',first:'All firms',opts:U.mact('firm')},{k:'owner',label:'Lead Owner',first:'All owners',opts:U.mact('users')},{k:'who',label:'Assignee',first:'All assignees',opts:U.mact('users')},{k:'src',label:'Source',first:'All sources',opts:U.mact('lead-sources')},{k:'cat',label:'Category',first:'All categories',opts:U.mact('lead-category')},{k:'cust',label:'Customer',first:'All customers',opts:U.mact('customers')}],false)+'</div>';
 // tiles
 if(on('kpis')){var noq=C.filter(function(r){return r.stage==='unassigned'||r.stage==='noquote';}),inprog=C.filter(function(r){return r.stage==='prepare'||r.stage==='check'||r.stage==='send';}),client=C.filter(function(r){return r.stage==='client';}),won=C.filter(function(r){return r.won;}),lost=C.filter(function(r){return r.stage==='lost'||r.stage==='rejected';});
  var d=PREV.length?Math.round((C.length-PREV.length)/PREV.length*100):null,delta=!R?'<span>'+short(sum(C))+' estimated</span>':d===null?'<span>'+short(sum(C))+' · no earlier data</span>':(d>=0?'<span class="up">'+ICON.up+Math.abs(d)+'%</span>':'<span class="down">'+ICON.down+Math.abs(d)+'%</span>')+'<span>vs previous · '+short(sum(C))+'</span>';
  var closed=won.length+lost.length;
  html+='<section class="ldx-tiles" aria-label="Key numbers">'+tile('Leads received',C.length,delta,'master',C)+tile('Without quotation',noq.length,noq.length?plural(noq.filter(isLate).length,'lead')+' overdue':'all quoted','master',noq)+tile('Quotations in progress',inprog.length,'prepare · check · send','master',inprog)+tile('Waiting for client',client.length,short(sum(client))+' with clients','client-approval',client)+tile('Won',closed?Math.round(won.length/closed*100)+'<small>%</small>':'–','<span>'+won.length+' won · '+short(sum(won))+'</span>','completed',won)+tile('Lost',lost.length,short(sum(lost))+' · rejected or canceled','master',lost,false)+tile('Overdue now',late.length,(open.length?Math.round(late.length/open.length*100):0)+'% of '+plural(open.length,'open lead'),'pending-follow-ups',late,late.length>0)+'</section>';}
 // pipeline board + volume
 var row1=[];
 if(on('waiting')){var max=1,rows=OPEN_STAGES.map(function(s){var a=open.filter(function(r){return r.stage===s.k;}),o=a.filter(isLate);max=Math.max(max,a.length);return{s:s,a:a,od:o.length,oldest:a.reduce(function(m,r){return Math.max(m,r.age);},0)};});
  row1.push(panel('pipe','Where open leads are waiting','Select a stage to filter the action list. Leads past the stage target or a follow-up date count as overdue.','<div class="ldx-legend"><span><i class="sw ok"></i>Inside target</span><span><i class="sw od"></i>Overdue</span></div>'+rows.map(function(x){var okW=(x.a.length-x.od)/max*100,odW=x.od/max*100;
   return'<button type="button" class="ldx-srow" data-a="ldx-stage" data-id="'+x.s.k+'" aria-pressed="'+(st.stage===x.s.k)+'"><span class="s-name">'+E(x.s.name)+'<small>'+E(x.s.note)+' · target '+plural(x.s.target,'day')+(x.a.length?' · oldest '+fmtD(x.oldest)+' · '+short(sum(x.a)):'')+'</small></span><span class="s-bar" aria-hidden="true">'+(x.a.length-x.od?'<i class="ok" style="width:'+okW+'%"></i>':'')+(x.od?'<i class="od" style="width:'+odW+'%"></i>':'')+'</span><span class="s-num"><b>'+x.a.length+'</b>'+(x.od?'<em>'+x.od+' overdue</em>':'<span class="muted">'+(x.a.length?'on time':'none')+'</span>')+'</span></button>';}).join('')));}
 if(on('volume'))row1.push(volume(st,ALL));
 if(row1.length)html+='<div class="ldx-g'+row1.length+'">'+row1.join('')+'</div>';
 // funnel + ageing
 var row2=[];
 if(on('funnel')){var F=[['Leads received',C],['Assigned',C.filter(function(r){return r.l.assigned_to;})],['Quotation assigned',C.filter(function(r){return r.q;})],['Prepared',C.filter(function(r){return r.q&&r.q.status!=='Pending Prepare Quotation';})],['Checked',C.filter(function(r){return r.q&&(r.q.checked||r.sent||r.q.status==='Pending Sending');})],['Sent to client',C.filter(function(r){return r.sent;})],['Approved',C.filter(function(r){return r.won;})],['Project created',C.filter(function(r){return r.q&&r.q.project_id;})]];
  row2.push(panel('fun','Lead → Quotation funnel','Leads received in the '+E(pname==='all time'?'whole record':'period')+', and how far each got. Right column: how many stopped before that stage.',bars(F.map(function(f,i){var c=f[1].length,prev=i?F[i-1][1].length:c,dr=prev-c;return{k:f[0],n:c,tip:plural(c,'lead')+' · '+money(sum(f[1])),x:i&&dr>0?'<em>−'+dr+'</em>':''};}),Math.max(1,C.length))));}
 if(on('ageing')){var cl=open.filter(function(r){return r.stage==='client';}),B=[['0–3 days',0,3],['4–7 days',4,7],['8–15 days',8,15],['16–30 days',16,30],['Over 30 days',31,1e9]],bi=B.map(function(b){var a=cl.filter(function(r){return r.age>=b[1]&&r.age<=b[2];});return{k:b[0],n:a.length,late:b[1]>3,tip:plural(a.length,'quotation')+' · '+money(sum(a)),x:short(sum(a))};});
  row2.push(panel('age','Quotation ageing',plural(cl.length,'sent quotation')+' waiting for the client’s decision · '+short(sum(cl))+'. Red is past the 3-day follow-up target.',bars(bi,Math.max.apply(null,bi.map(function(b){return b.n;}).concat([1])))));}
 if(row2.length)html+='<div class="ldx-g'+row2.length+'">'+row2.join('')+'</div>';
 // action list
 if(on('actions')){var list=open.filter(function(r){return(!st.stage||r.stage===st.stage)&&(st.view==='all'||isLate(r));}).sort(function(a,b){return lateBy(b)-lateBy(a)||b.age-a.age;}),sd=st.stage&&SBY[st.stage];
  var meta=(st.view==='all'?plural(list.length,'open lead'):plural(list.length,'overdue lead'))+', longest wait first'+(sd?' · <button type="button" class="ldx-chip" data-a="ldx-stage" data-id="'+sd.k+'">'+E(sd.name)+' ×</button>':'');
  var body='<div class="ldx-tw"><table class="ldx-t"><thead><tr><th>Lead</th><th>Waiting at</th><th>Assigned to</th><th class="num">Value</th><th class="num">In stage</th><th>Status</th><th></th></tr></thead><tbody>'+(!list.length?'<tr><td colspan="7"><div class="ldx-empty"><span class="ldx-pill ok">'+ICON.check+'Clear</span><span>'+(st.view==='all'?'No open leads here.':'Nothing is past its target. Every lead is on time.')+'</span></div></td></tr>':'')+(st.showAll?list:list.slice(0,10)).map(function(r){var s=SBY[r.stage],lb=lateBy(r),pill=lb>0?'<span class="ldx-pill bad">'+ICON.warn+(r.late>=r.over?'Follow-up '+fmtD(r.late)+' late':fmtD(r.over)+' over')+'</span>':'<span class="ldx-pill neutral">'+ICON.clock+(r.target-r.age>0?fmtD(r.target-r.age)+' left':'due today')+'</span>';
    return'<tr><td><div class="cname">'+E(U.nm('customers',r.l.customer_id)||'—')+'</div><div class="lead-id">'+E(r.l.lead_no||'')+(r.q&&r.q.no?' · '+E(r.q.no):'')+'</div></td><td>'+E(s.name)+'</td><td>'+E(U.user(r.l.assigned_to)||'Unassigned')+'<div class="muted sm">Owner: '+E(U.user(r.l.owner_id)||'—')+'</div></td><td class="num">'+money(r.value)+'</td><td class="num">'+fmtD(r.age)+'</td><td>'+pill+'</td><td class="act"><a class="mv-btn sm primary" href="#leads.'+(r.late>r.over&&r.stage!=='client'?'pending-follow-ups':s.route)+'">Open</a>'+(r.q?U.btn('q-view',r.q.id,'Quotation'):'')+'</td></tr>';}).join('')+'</tbody></table></div>'+(list.length>10?'<button type="button" class="ldx-link" data-a="ldx-showall">'+(st.showAll?'Show fewer':'Show all '+list.length)+'</button>':'');
  html+=panel('list','Leads that need action',meta,body,seg('ldx-view',st.view,[['overdue','Overdue'],['all','All open']],'Which leads'));}
 // team
 if(on('team')){var T={};C.forEach(function(r){var id=r.l.assigned_to||'';var x=T[id]||(T[id]={id:id,n:0,sent:0,won:0,lost:0,wv:0,lq:[]});x.n++;if(r.sent)x.sent++;if(r.won){x.won++;x.wv+=r.value;}if(r.stage==='lost'||r.stage==='rejected')x.lost++;if(r.q&&r.q.sent&&r.q.sent.date)x.lq.push(days(r.l.date,r.q.sent.date));});
  open.forEach(function(r){var id=r.l.assigned_to||'';var x=T[id]||(T[id]={id:id,n:0,sent:0,won:0,lost:0,wv:0,lq:[]});x.open=(x.open||0)+1;if(isLate(r))x.od=(x.od||0)+1;});
  var TR=Object.values(T).map(function(x){x.open=x.open||0;x.od=x.od||0;x.ontime=x.open?Math.round((x.open-x.od)/x.open*100):null;return x;}).sort(function(a,b){return b.od-a.od||b.n-a.n;});
  html+=panel('team','Team performance','Leads received in the period per assignee, and their open work now. On time is the share of open leads inside target; the mark is 85%. Most overdue first.','<div class="ldx-tw"><table class="ldx-t wrap"><thead><tr><th>Assignee</th><th class="num">Leads</th><th class="num">Quotations sent</th><th class="num">Won</th><th class="num">Conversion</th><th class="num">Value won</th><th class="num">Avg days to send</th><th class="num">Open now</th><th>On time</th><th class="num">Overdue</th><th>Rating</th></tr></thead><tbody>'+(TR.length?'':'<tr><td colspan="11" class="muted">No leads for these filters.</td></tr>')+TR.map(function(x){var cls=x.won+x.lost,rt;
   if(x.ontime===null||x.open<3)rt='<span class="ldx-pill neutral">Too few yet</span>';else if(x.ontime>=85)rt='<span class="ldx-pill ok">'+ICON.check+'On target</span>';else if(x.ontime>=70)rt='<span class="ldx-pill warn">'+ICON.warn+'Watch</span>';else rt='<span class="ldx-pill bad">'+ICON.warn+'Needs attention</span>';
   return'<tr><td><div class="cname">'+E(U.user(x.id)||'Unassigned')+'</div></td><td class="num">'+x.n+'</td><td class="num">'+x.sent+'</td><td class="num">'+x.won+'</td><td class="num">'+(cls?pct(x.won,cls):'–')+'</td><td class="num">'+money(x.wv)+'</td><td class="num">'+(x.lq.length?(x.lq.reduce(function(a,b){return a+b;},0)/x.lq.length).toFixed(1):'–')+'</td><td class="num">'+x.open+'</td><td>'+(x.ontime===null?'<span class="muted">–</span>':'<div class="ldx-ot"><div class="trk"><div class="fill" style="width:'+x.ontime+'%"></div><div class="tgt" style="left:85%"></div></div><b>'+x.ontime+'%</b></div>')+'</td><td class="num">'+(x.od?'<b class="bad">'+x.od+'</b>':'0')+'</td><td>'+rt+'</td></tr>';}).join('')+'</tbody></table></div>');}
 // source + category
 if(on('source')){var grp=function(key,coll){var G={};C.forEach(function(r){var id=r.l[key]||'';var x=G[id]||(G[id]={k:U.nm(coll,id)||'Unspecified',n:0,won:0,wv:0});x.n++;if(r.won){x.won++;x.wv+=r.value;}});var a=Object.values(G).sort(function(p,q){return q.n-p.n;});
   return a.length?'<div class="ldx-blh"><span></span><span></span><span>Leads</span><span>Won</span></div>'+bars(a.map(function(x){return{k:x.k,n:x.n,tip:plural(x.n,'lead')+' · '+x.won+' won · '+money(x.wv),x:x.won+' <small>'+pct(x.won,x.n)+'</small>'};}),a[0].n):'<span class="muted">No leads in this period.</span>';};
  html+='<div class="ldx-g2">'+panel('src','Where leads come from','Leads received in the period by source, and how many were won.',grp('lead_source_id','lead-sources'))+panel('cat','Lead category','Leads received in the period by category, and how many were won.',grp('lead_category_id','lead-category'))+'</div>';}
 // lost
 if(on('lost')){var L=C.filter(function(r){return r.stage==='lost'||r.stage==='rejected';}).sort(function(a,b){return String(b.since||'').localeCompare(String(a.since||''));}),RS={};
  L.forEach(function(r){var k=String((r.stage==='lost'?r.l.cancel_reason:r.q&&r.q.reject_reason)||'No reason given').trim();var x=RS[k.toLowerCase()]||(RS[k.toLowerCase()]={k:k,n:0,v:0});x.n++;x.v+=r.value;});
  var RA=Object.values(RS).sort(function(a,b){return b.n-a.n;});
  html+=panel('lost','Lost analysis',plural(L.length,'lead')+' lost in the period · '+short(sum(L))+'. Rejected quotations can still be revised and sent again.','<div class="ldx-lost">'+(L.length?'<div><h3 class="ldx-h3">Reasons</h3>'+bars(RA.map(function(x){return{k:x.k,n:x.n,late:true,tip:plural(x.n,'lead')+' · '+money(x.v),x:short(x.v)};}),RA[0].n)+'</div>':'')+'<div class="ldx-tw"><h3 class="ldx-h3">Latest lost leads</h3><table class="ldx-t"><thead><tr><th>Lead</th><th>Outcome</th><th class="num">Value</th><th>Reason</th><th>Date</th></tr></thead><tbody>'+(L.length?'':'<tr><td colspan="5"><div class="ldx-empty"><span class="ldx-pill ok">'+ICON.check+'None</span><span>No lost leads for these filters.</span></div></td></tr>')+L.slice(0,12).map(function(r){return'<tr><td><div class="cname">'+E(U.nm('customers',r.l.customer_id)||'—')+'</div><div class="lead-id">'+E(r.l.lead_no||'')+' · '+E(U.user(r.l.assigned_to)||'Unassigned')+'</div></td><td><span class="ldx-pill '+(r.stage==='lost'?'neutral':'warn')+'">'+(r.stage==='lost'?'Lead canceled':'Quotation rejected')+'</span></td><td class="num">'+money(r.value)+'</td><td>'+E(r.stage==='lost'?r.l.cancel_reason||'':r.q&&r.q.reject_reason||'')+'</td><td>'+U.dmy(String(r.since||'').slice(0,10))+'</td></tr>';}).join('')+'</tbody></table>'+(L.length>12?'<p class="muted sm">Latest 12 of '+L.length+'. See all in <a href="#leads.canceled">Canceled Leads</a>.</p>':'')+'</div></div>');}
 if(!SECTIONS.some(function(s){return on(s[0]);}))html+='<p class="mv-note">All sections are switched off. Turn them on in <a href="#leads.dashboard-settings">Dashboard Settings</a>.</p>';
 return html+'</div>';});
U.act('ldx-period',function(v){U.st().period=v;U.paint();});
U.act('ldx-view',function(v){var s=U.st();s.view=v;s.showAll=false;U.paint();});
U.act('ldx-vol',function(v){U.st().vol=v;U.paint();});
U.act('ldx-voltable',function(){var s=U.st();s.volTable=!s.volTable;U.paint();});
U.act('ldx-stage',function(v){var s=U.st();s.stage=s.stage===v?'':v;s.showAll=false;U.paint();var el=document.getElementById('ldx-list');if(s.stage&&el)el.scrollIntoView({behavior:'smooth',block:'start'});});
U.act('ldx-showall',function(){var s=U.st();s.showAll=!s.showAll;U.paint();});
// ---------- settings ----------
U.page('leads.dashboard-settings',function(){
 if(!U.base(['app_settings']))return U.loading;
 var s=settings(),ro=U.ro();
 return'<div class="ldx"><section class="ldx-panel ds-card"><div class="ldx-ph"><div><h2>Lead Dashboard sections</h2><p>Tick the sections the Lead Dashboard should show. This applies to everyone.</p></div></div><ul class="ds-list">'+SECTIONS.map(function(x){return'<li><label class="ds-row"><input type="checkbox" class="ds-cb" data-k="'+x[0]+'"'+(on(x[0])?' checked':'')+(ro?' disabled':'')+'><span><b>'+E(x[1])+'</b><small>'+E(x[2])+'</small></span></label></li>';}).join('')+'</ul>'+(ro?'':'<p class="ds-acts">'+U.btn('ds-all','','Select all')+U.btn('ds-save','','Save',true)+'</p>')+(s&&s.updatedAt?'<p class="muted sm">Last changed '+U.dmy(String(s.updatedAt).slice(0,10))+(s.by?' by '+E(U.user(s.by)||''):'')+'.</p>':'')+'</section></div>';});
U.act('ds-all',function(){document.querySelectorAll('.ds-cb').forEach(function(c){c.checked=true;});});
U.act('ds-save',async function(){var sec={};document.querySelectorAll('.ds-cb').forEach(function(c){sec[c.dataset.k]=c.checked;});var s=settings(),me=(window.UmangAuth&&(window.UmangAuth.row||window.UmangAuth.me)||{}).id||'';
 try{if(s)await U.upd('app_settings',s.id,{sections:sec,by:me});else await U.add('app_settings',{key:SKEY,sections:sec,by:me});U.flash('Dashboard settings saved.');}catch(e){U.flash((e&&(e.msg||e.message))||'Could not save the settings.');}});
})();
