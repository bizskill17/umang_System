/* Lead Dashboard, built around the lead → quotation flow, with sections switched on or off in Leads › Dashboard Settings. */
(function(){'use strict';
var U=window.U,P=U.P,E=U.esc,n=function(v){return Number(v)||0;};
var SECTIONS=[['kpis','Headline numbers','Leads received, without quotation, in progress, waiting for client, won, lost, overdue'],['funnel','Lead → Quotation funnel','How many leads reach each stage, and where they drop out'],['waiting','Where leads are waiting','Leads at each stage now, value, average days and over-target count'],['ageing','Quotation ageing','Sent quotations waiting for the client, by days since sending'],['team','Team performance','Per assignee: leads, quotations sent, won, conversion, overdue'],['source','Source and category','Which sources and categories bring business that converts'],['lost','Lost analysis','Rejected quotations and canceled leads with their reasons'],['actions','Action list','Open leads and quotations needing attention, oldest overdue first']];
var SKEY='lead-dashboard';
function settings(){return U.rows('app_settings').find(function(r){return r.key===SKEY;})||null;}
function on(k){var s=settings();return!s||!s.sections||s.sections[k]!==false;}
function money(v){return(U.inr(Math.round(n(v)))||'₹0').replace(/\.00$/,'');}
function today(){return U.today();}
function days(a,b){if(!a)return 0;var x=Date.parse(String(a).slice(0,10)+'T00:00:00Z'),y=Date.parse(String(b||today()).slice(0,10)+'T00:00:00Z');return isFinite(x)&&isFinite(y)?Math.max(0,Math.round((y-x)/864e5)):0;}
function pct(a,b){return b?Math.round(a/b*100)+'%':'—';}
// The lead's live quotation: the newest one that isn't canceled.
function quoteOf(l,qs){var mine=qs.filter(function(q){return q.lead_id===l.id;}).sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''));});return mine.find(function(q){return q.status!=='Canceled';})||null;}
// Stage, the date the lead entered it, the target days and the list that works it.
var STAGES=[
 {k:'unassigned',name:'Unassigned',target:1,route:'pending-assignee'},
 {k:'noquote',name:'Assigned, no quotation yet',target:3,route:'pending-follow-ups'},
 {k:'prepare',name:'Quotation to prepare',target:2,route:'prepare-quotation'},
 {k:'check',name:'Prepared, to check',target:1,route:'checking'},
 {k:'send',name:'Checked, to send',target:1,route:'sending'},
 {k:'client',name:'Sent, waiting for client',target:3,route:'client-approval'},
 {k:'rejected',name:'Rejected, to revise or cancel',target:3,route:'quotation-follow-ups'},
 {k:'project',name:'Approved, project to create',target:1,route:'pending-create-project'},
 {k:'won',name:'Project created (won)',target:0,route:'completed'},
 {k:'lost',name:'Lead canceled (lost)',target:0,route:'canceled'}];
var SBY={};STAGES.forEach(function(s){SBY[s.k]=s;});
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
function build(st){
 var qs=U.rows('quotations'),t=today();
 var leads=U.rows('leads').filter(function(l){return(!st.firm||l.firm_id===st.firm)&&(!st.owner||l.owner_id===st.owner)&&(!st.who||l.assigned_to===st.who)&&(!st.src||l.lead_source_id===st.src)&&(!st.cat||l.lead_category_id===st.cat)&&(!st.cust||l.customer_id===st.cust)&&U.match(st,[l.lead_no,U.nm('customers',l.customer_id),l.remarks].join(' '),l.date);});
 return leads.map(function(l){var q=quoteOf(l,qs),sg=stageOf(l,q),age=days(sg.since,t),tg=SBY[sg.k].target,due=nextDue(l,q);
  return{l:l,q:q,stage:sg.k,since:sg.since,age:age,over:tg>0&&age>tg,value:q&&n(q.total)?n(q.total):n(l.estimate),due:due,late:due&&due<t?days(due,t):0,
   open:sg.k!=='won'&&sg.k!=='lost',sent:!!(q&&(q.sent||q.status==='Pending Approval'||q.status==='Approved'||q.status==='Rejected')),won:!!(q&&q.status==='Approved'),lostRej:!!(q&&q.status==='Rejected')};});}
function card(title,body,note){return'<section class="ld-card"><h3>'+E(title)+'</h3>'+(note?'<p class="mf-hint">'+note+'</p>':'')+body+'</section>';}
function table(cols,rows,empty){return U.table(cols,rows,null,empty||'Nothing to show for these filters.');}
U.page('leads.dashboard',function(){
 if(!U.base(['leads','quotations','projects','app_settings',U.m('lead-sources'),U.m('lead-category'),U.m('firm')]))return U.loading;
 var st=U.st(),R=build(st),t=today(),html='';
 html+=U.bar(st,[{k:'firm',label:'Firm',first:'All firms',opts:U.mact('firm')},{k:'owner',label:'Lead Owner',first:'All owners',opts:U.mact('users')},{k:'who',label:'Assignee',first:'All assignees',opts:U.mact('users')},{k:'src',label:'Source',first:'All sources',opts:U.mact('lead-sources')},{k:'cat',label:'Category',first:'All categories',opts:U.mact('lead-category')},{k:'cust',label:'Customer',first:'All customers',opts:U.mact('customers')}],true);
 var open=R.filter(function(r){return r.open;}),noq=R.filter(function(r){return r.stage==='unassigned'||r.stage==='noquote';}),inprog=R.filter(function(r){return r.stage==='prepare'||r.stage==='check'||r.stage==='send';}),client=R.filter(function(r){return r.stage==='client';}),won=R.filter(function(r){return r.won;}),lost=R.filter(function(r){return r.stage==='lost'||r.stage==='rejected';}),late=R.filter(function(r){return r.open&&r.late>0;});
 var sum=function(a){return a.reduce(function(x,r){return x+r.value;},0);};
 var ids=function(a){return a.map(function(r){return r.l.id;});};
 if(on('kpis'))html+=U.kpis('leads',[['Leads Received · '+money(sum(R)),R.length,'master',ids(R)],['Without Quotation',noq.length,'master',ids(noq)],['Quotations In Progress',inprog.length,'master',ids(inprog)],['Waiting for Client · '+money(sum(client)),client.length,'master',ids(client)],['Won · '+money(sum(won))+' · '+pct(won.length,R.length),won.length,'completed',ids(won)],['Lost · '+money(sum(lost)),lost.length,'master',ids(lost)],['Overdue Follow-ups',late.length,'pending-follow-ups',ids(late)]]);
 if(on('funnel')){var F=[['Leads received',R],['Assigned',R.filter(function(r){return r.l.assigned_to;})],['Quotation assigned',R.filter(function(r){return r.q;})],['Prepared',R.filter(function(r){return r.q&&r.q.status!=='Pending Prepare Quotation';})],['Checked',R.filter(function(r){return r.q&&(r.q.checked||r.sent||r.q.status==='Pending Sending');})],['Sent to client',R.filter(function(r){return r.sent;})],['Approved',won],['Project created',R.filter(function(r){return r.q&&r.q.project_id;})]],top=Math.max(1,R.length);
  var fh='<div class="fn">'+F.map(function(f,i){var c=f[1].length,prev=i?F[i-1][1].length:c,drop=prev-c;return'<div class="fn-row"><span class="fn-name">'+E(f[0])+'</span><span class="fn-bar"><span style="width:'+Math.max(c?3:0,c/top*100)+'%"></span></span><span class="fn-n">'+c+'</span><span class="fn-v">'+money(sum(f[1]))+'</span><span class="fn-d">'+(i&&drop>0?'−'+drop+' ('+pct(drop,prev)+')':'')+'</span></div>';}).join('')+'</div>';
  html+=card('Lead → Quotation funnel',fh,'How many of these leads reached each stage. The last column is how many stopped before it.');}
 if(on('waiting')){var rows=STAGES.filter(function(s){return s.k!=='won'&&s.k!=='lost';}).map(function(s){var a=R.filter(function(r){return r.stage===s.k;});return{s:s,a:a};});
  html+=card('Where leads are waiting',table([['Stage',function(x){return'<a href="#leads.'+x.s.route+'">'+E(x.s.name)+'</a>';}],['Leads',function(x){return x.a.length;}],['Value',function(x){return money(sum(x.a));}],['Avg. Days',function(x){return x.a.length?Math.round(x.a.reduce(function(t,r){return t+r.age;},0)/x.a.length):'—';}],['Target',function(x){return x.s.target+' day'+(x.s.target===1?'':'s');}],['Over Target',function(x){var o=x.a.filter(function(r){return r.over;}).length;return o?'<b class="ld-bad">'+o+'</b>':'0';}]],rows),'Days are counted from when the lead entered the stage. Targets follow the Lead SOP.');}
 if(on('ageing')){var B=[['0–3 days',0,3],['4–7 days',4,7],['8–15 days',8,15],['16–30 days',16,30],['Over 30 days',31,1e9]];
  html+=card('Quotation ageing',table([['Waiting since sending',function(b){return E(b[0]);}],['Quotations',function(b){return client.filter(function(r){return r.age>=b[1]&&r.age<=b[2];}).length;}],['Value',function(b){return money(sum(client.filter(function(r){return r.age>=b[1]&&r.age<=b[2];})));}]],B),'Sent quotations still waiting for the client’s decision.');}
 if(on('team')){var T={};R.forEach(function(r){var id=r.l.assigned_to||'';var x=T[id]||(T[id]={id:id,all:[],open:0,sent:0,won:0,wv:0,late:0,lq:[]});x.all.push(r);if(r.open)x.open++;if(r.sent)x.sent++;if(r.won){x.won++;x.wv+=r.value;}if(r.open&&r.late)x.late++;if(r.q&&r.q.sent&&r.q.sent.date)x.lq.push(days(r.l.date,r.q.sent.date));});
  html+=card('Team performance',table([['Assignee',function(x){return E(U.user(x.id)||'Unassigned');}],['Leads',function(x){return x.all.length;}],['Open',function(x){return x.open;}],['Quotations Sent',function(x){return x.sent;}],['Won',function(x){return x.won;}],['Conversion',function(x){return pct(x.won,x.all.length);}],['Value Won',function(x){return money(x.wv);}],['Overdue Follow-ups',function(x){return x.late?'<b class="ld-bad">'+x.late+'</b>':'0';}],['Avg. Days Lead → Sent',function(x){return x.lq.length?Math.round(x.lq.reduce(function(a,b){return a+b;},0)/x.lq.length):'—';}]],Object.values(T).sort(function(a,b){return b.all.length-a.all.length;})));}
 if(on('source')){var grp=function(key,coll,label){var G={};R.forEach(function(r){var id=r.l[key]||'';var x=G[id]||(G[id]={id:id,n:0,sent:0,won:0,wv:0});x.n++;if(r.sent)x.sent++;if(r.won){x.won++;x.wv+=r.value;}});return table([[label,function(x){return E(U.nm(coll,x.id)||'Unspecified');}],['Leads',function(x){return x.n;}],['Quotations Sent',function(x){return x.sent;}],['Won',function(x){return x.won;}],['Conversion',function(x){return pct(x.won,x.n);}],['Value Won',function(x){return money(x.wv);}]],Object.values(G).sort(function(a,b){return b.n-a.n;}));};
  html+=card('By lead source',grp('lead_source_id','lead-sources','Source'))+card('By lead category',grp('lead_category_id','lead-category','Category'));}
 if(on('lost')){var L=lost.slice().sort(function(a,b){return String(b.since||'').localeCompare(String(a.since||''));});
  html+=card('Lost analysis · '+L.length+' leads · '+money(sum(L)),table([['Lead',function(r){return E(r.l.lead_no||'');}],['Customer',function(r){return E(U.nm('customers',r.l.customer_id));}],['Outcome',function(r){return r.stage==='lost'?'Lead canceled':'Quotation rejected';}],['Value',function(r){return money(r.value);}],['Reason',function(r){return E(r.stage==='lost'?r.l.cancel_reason||'':r.q&&r.q.reject_reason||'');}],['Date',function(r){return U.dmy(r.since);}],['Assignee',function(r){return E(U.user(r.l.assigned_to));}]],L,'No lost leads for these filters.'),'Rejected quotations can still be revised and sent again.');}
 if(on('actions')){var A=open.filter(function(r){return r.late||r.over;}).sort(function(a,b){return Math.max(b.late,b.age)-Math.max(a.late,a.age);});
  html+=card('Action list — oldest overdue first',table([['Lead',function(r){return'<b>'+E(r.l.lead_no||'')+'</b>';}],['Customer',function(r){return E(U.nm('customers',r.l.customer_id));}],['Stage',function(r){return E(SBY[r.stage].name);}],['Value',function(r){return money(r.value);}],['Assignee',function(r){return E(U.user(r.l.assigned_to)||'Unassigned');}],['Why',function(r){return r.late?'Follow-up overdue '+r.late+' day'+(r.late===1?'':'s'):r.age+' days in stage (target '+SBY[r.stage].target+')';}],['Action',function(r){return'<a class="mv-btn sm primary" href="#leads.'+(r.late&&r.stage!=='client'?'pending-follow-ups':SBY[r.stage].route)+'">Open</a>'+(r.q?U.btn('q-view',r.q.id,'Quotation'):'');},'act']],A,'Nothing overdue. Well done.'));}
 if(!SECTIONS.some(function(s){return on(s[0]);}))html+='<p class="mv-note">All sections are switched off. Turn them on in <a href="#leads.dashboard-settings">Dashboard Settings</a>.</p>';
 return html;});
// ---------- settings ----------
U.page('leads.dashboard-settings',function(){
 if(!U.base(['app_settings']))return U.loading;
 var s=settings(),ro=U.ro();
 return'<div class="ld-card ds-card"><h3>Lead Dashboard sections</h3><p class="mf-hint">Tick the sections the Lead Dashboard should show. This applies to everyone.</p><ul class="ds-list">'+SECTIONS.map(function(x){return'<li><label class="ds-row"><input type="checkbox" class="ds-cb" data-k="'+x[0]+'"'+(on(x[0])?' checked':'')+(ro?' disabled':'')+'><span><b>'+E(x[1])+'</b><small>'+E(x[2])+'</small></span></label></li>';}).join('')+'</ul>'+(ro?'':'<p class="ds-acts">'+U.btn('ds-all','','Select all')+U.btn('ds-save','','Save',true)+'</p>')+(s&&s.updatedAt?'<p class="mf-hint">Last changed '+U.dmy(String(s.updatedAt).slice(0,10))+(s.by?' by '+E(U.user(s.by)||''):'')+'.</p>':'')+'</div>';});
U.act('ds-all',function(){document.querySelectorAll('.ds-cb').forEach(function(c){c.checked=true;});});
U.act('ds-save',async function(){var sec={};document.querySelectorAll('.ds-cb').forEach(function(c){sec[c.dataset.k]=c.checked;});var s=settings(),me=(window.UmangAuth&&(window.UmangAuth.row||window.UmangAuth.me)||{}).id||'';
 try{if(s)await U.upd('app_settings',s.id,{sections:sec,by:me});else await U.add('app_settings',{key:SKEY,sections:sec,by:me});U.flash('Dashboard settings saved.');}catch(e){U.flash((e&&(e.msg||e.message))||'Could not save the settings.');}});
})();
