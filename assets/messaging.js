/* Master Data › Message Settings and Message Log: the WhatsApp account, department groups, and which
   messages and daily summaries go to which group. Sending happens on the server (api/messaging.php). */
(function(){'use strict';
var U=window.U,E=U.esc;
var INSTANT=['new_lead','estimate_updated','lead_assigned','recce_assigned','recce_updated','design_assigned','design_updated','quotation_assigned','quotation_made','quotation_checked','quotation_sent','quotation_status','follow_up','lead_canceled'];
var SUMMARY=['daily_outcomes','not_assigned','no_action','recce_progress','design_progress','q_prepare','q_check','q_send','q_client','pending_project'];
var WHEN={new_lead:'A lead is added',estimate_updated:'The estimate on a lead changes',lead_assigned:'A lead is assigned or reassigned',recce_assigned:'A recce is created',recce_updated:'A recce update is saved',design_assigned:'A design job is created',design_updated:'Designs are completed or approved',quotation_assigned:'A quotation is assigned to prepare',quotation_made:'A quotation is prepared',quotation_checked:'A quotation is checked',quotation_sent:'A quotation is sent to the client',quotation_status:'The client approves or rejects',follow_up:'A follow-up is saved',lead_canceled:'A lead is canceled',
 daily_outcomes:'Approved, rejected and canceled today',not_assigned:'Leads with no assignee, by owner',no_action:'No assignee, recce, design or quotation',recce_progress:'Recce with pending sites, by surveyor',design_progress:'Design jobs with pending designs, by designer',q_prepare:'Assigned, not prepared, by preparer',q_check:'Prepared, not checked',q_send:'Checked, not sent, by check date',q_client:'Sent, waiting for the client, by sent date',pending_project:'Approved, project not created'};
var PERSON={lead_assigned:'Assignee',recce_assigned:'Surveyor',design_assigned:'Designer',quotation_assigned:'Preparer'};
var DEFGROUPS=[['director','Director'],['sales','Leads'],['recce','Recce'],['design','Design'],['quotation','Quotation'],['followup','Follow-up']];
var DEFMAP={new_lead:['sales'],estimate_updated:['sales'],lead_assigned:['sales'],recce_assigned:['recce'],recce_updated:['recce'],design_assigned:['design'],design_updated:['design'],quotation_assigned:['quotation'],quotation_made:['director','quotation'],quotation_checked:['quotation'],quotation_sent:['quotation'],quotation_status:['sales','director'],follow_up:['followup'],lead_canceled:['director'],
 daily_outcomes:['director'],not_assigned:['director'],no_action:['director'],recce_progress:['recce'],design_progress:['design'],q_prepare:['quotation'],q_check:['quotation'],q_send:['quotation'],q_client:['sales'],pending_project:['director']};
var DAYS=[[1,'Mon'],[2,'Tue'],[3,'Wed'],[4,'Thu'],[5,'Fri'],[6,'Sat'],[7,'Sun']];
var ST=null,stLoading=false,D=null,LOG=null,logLoading=false,busy='';
function api(cmd,extra){if(!window.UmangServer||!window.UmangServer.msg)return Promise.reject({msg:'WhatsApp messages need the connected database service.'});return window.UmangServer.msg(Object.assign({cmd:cmd},extra||{}));}
function err(e){return(e&&(e.msg||e.message))||'Something went wrong.';}
function doc(){return U.rows('app_settings').find(function(r){return r.key==='messaging';})||null;}
function title(k){return ST&&ST.events&&ST.events[k]?ST.events[k].title:k;}
function draft(){if(D)return D;var s=doc()||{};D={groups:JSON.parse(JSON.stringify(s.groups||DEFGROUPS.map(function(g){return{key:g[0],name:g[1],gid:'',active:true};}))),events:{},quiet:Object.assign({from:'21:00',to:'08:00',off:false},s.quiet||{})};
 INSTANT.concat(SUMMARY).forEach(function(k){var c=(s.events||{})[k]||{};D.events[k]={on:c.on!==undefined?!!c.on:true,groups:c.groups?c.groups.slice():(s.groups?[]:(DEFMAP[k]||[]).slice()),person:c.person!==undefined?!!c.person:!!PERSON[k],time:c.time||'09:30',days:c.days?c.days.slice():[1,2,3,4,5,6]};});return D;}
// Read every input into the draft before re-drawing, so nothing typed is lost.
function readDom(){if(!D)return;var root=document.getElementById('msx');if(!root)return;
 root.querySelectorAll('[data-g]').forEach(function(r){var g=D.groups[+r.dataset.g];if(!g)return;g.name=r.querySelector('.msx-gname').value.trim();g.gid=r.querySelector('.msx-gid').value.trim();g.active=r.querySelector('.msx-gon').checked;});
 root.querySelectorAll('[data-ev]').forEach(function(r){var e=D.events[r.dataset.ev];e.on=r.querySelector('.msx-on').checked;e.groups=[].map.call(r.querySelectorAll('.msx-eg:checked'),function(c){return c.value;});var p=r.querySelector('.msx-person');if(p)e.person=p.checked;var t=r.querySelector('.msx-time');if(t)e.time=t.value||'09:30';var ds=r.querySelectorAll('.msx-day');if(ds.length)e.days=[].filter.call(ds,function(c){return c.checked;}).map(function(c){return+c.value;});});
 var q=root.querySelector('#msx-qfrom');if(q){D.quiet.from=q.value;D.quiet.to=root.querySelector('#msx-qto').value;D.quiet.off=root.querySelector('#msx-qoff').checked;}}
function load(){if(ST||stLoading)return;stLoading=true;api('status').then(function(r){ST=r;stLoading=false;U.paint();},function(e){ST={error:err(e)};stLoading=false;U.paint();});}
function gList(){return D.groups.filter(function(g){return g.key;});}
// One column per group, a tick box in each cell.
function evRow(k,summary){var e=D.events[k];
 return'<tr data-ev="'+k+'"><td><label class="msx-sw"><input type="checkbox" class="msx-on"'+(e.on?' checked':'')+'><span></span></label></td><td class="msx-name"><b>'+E(title(k))+'</b><div class="muted sm">'+E(WHEN[k]||'')+'</div></td>'+
  gList().map(function(g){return'<td class="msx-cell"><input type="checkbox" class="msx-eg" value="'+E(g.key)+'" aria-label="'+E(title(k)+' to '+(g.name||'group'))+'"'+(e.groups.indexOf(g.key)>=0?' checked':'')+'></td>';}).join('')+
  (summary?'<td><input type="time" class="msx-time" value="'+E(e.time)+'"></td><td><div class="msx-days">'+DAYS.map(function(d){return'<label title="'+d[1]+'"><input type="checkbox" class="msx-day" value="'+d[0]+'"'+(e.days.indexOf(d[0])>=0?' checked':'')+'><span>'+d[1].charAt(0)+'</span></label>';}).join('')+'</div></td><td class="act">'+U.btn('msx-preview',k,'Preview')+U.btn('msx-run',k,'Send now')+'</td>'
   :'<td class="msx-cell">'+(PERSON[k]?'<input type="checkbox" class="msx-person" aria-label="Also to the '+PERSON[k]+'"'+(e.person?' checked':'')+'>':'<span class="muted">–</span>')+'</td>')+'</tr>';}
function gHead(){var g=gList();return g.length?g.map(function(x){return'<th class="msx-gh">'+E(x.name||'Unnamed')+'</th>';}).join(''):'<th class="muted">Add a group first</th>';}
U.page('masters.message-settings',function(){
 if(!U.base(['app_settings']))return U.loading;load();
 if(!ST)return U.loading;
 if(ST.error)return'<div class="msx"><p class="mv-note warn">'+E(ST.error)+'</p></div>';
 draft();var h='<div class="msx" id="msx">';
 h+='<section class="msx-card"><div class="msx-head"><div><h2>WhatsApp account</h2></div><span class="ldx-pill '+(ST.connected?'ok':'bad')+'">'+(ST.connected?'Connected':'Not set')+'</span></div>'+
  (ST.can_account?'<div class="msx-acc"><label>Username<input id="msx-user" autocomplete="off" value="'+E(ST.username||'')+'"></label><label>Password<input id="msx-pass" type="password" autocomplete="new-password" placeholder="'+(ST.connected?'Leave blank to keep the saved password':'MessageAutoSender password')+'"></label>'+U.btn('msx-acc','','Save account',true)+'</div>':'<p class="muted sm">Only the administrator can change the account.</p>')+'</section>';
 h+='<section class="msx-card"><div class="msx-head"><div><h2>WhatsApp groups</h2></div>'+U.btn('msx-addg','','+ Add group')+'</div><div class="ldx-tw"><table class="ldx-t narrow msx-gt"><thead><tr><th>Group name</th><th>Group ID</th><th>Active</th><th></th></tr></thead><tbody>'+
  D.groups.map(function(g,i){return'<tr data-g="'+i+'"><td><input class="msx-gname" value="'+E(g.name||'')+'" placeholder="e.g. Director"></td><td><input class="msx-gid" value="'+E(g.gid||'')+'" placeholder="Group ID from MessageAutoSender"></td><td><label class="msx-sw"><input type="checkbox" class="msx-gon"'+(g.active!==false?' checked':'')+'><span></span></label></td><td class="act">'+U.btn('msx-testg',String(i),'Send test')+U.btn('msx-delg',String(i),'Remove')+'</td></tr>';}).join('')+'</tbody></table></div></section>';
 h+='<section class="msx-card"><div class="msx-head"><div><h2>Instant messages</h2></div></div><div class="ldx-tw"><table class="ldx-t msx-et msx-grid"><thead><tr><th rowspan="2">On</th><th rowspan="2">Message</th><th colspan="'+Math.max(1,gList().length)+'" class="msx-gtop">Send to groups</th><th rowspan="2" class="msx-gh">Also to person</th></tr><tr>'+gHead()+'</tr></thead><tbody>'+INSTANT.map(function(k){return evRow(k,false);}).join('')+'</tbody></table></div></section>';
 h+='<section class="msx-card"><div class="msx-head"><div><h2>Daily summaries</h2></div></div><div class="ldx-tw"><table class="ldx-t msx-et msx-grid"><thead><tr><th rowspan="2">On</th><th rowspan="2">Summary</th><th colspan="'+Math.max(1,gList().length)+'" class="msx-gtop">Send to groups</th><th rowspan="2">Time</th><th rowspan="2">Days</th><th rowspan="2"></th></tr><tr>'+gHead()+'</tr></thead><tbody>'+SUMMARY.map(function(k){return evRow(k,true);}).join('')+'</tbody></table></div></section>';
 h+='<section class="msx-card"><div class="msx-head"><div><h2>Quiet hours</h2><p>Messages created in quiet hours wait and go out when quiet hours end.</p></div></div><div class="msx-acc"><label>From<input type="time" id="msx-qfrom" value="'+E(D.quiet.from)+'"></label><label>To<input type="time" id="msx-qto" value="'+E(D.quiet.to)+'"></label><label class="msx-chip"><input type="checkbox" id="msx-qoff"'+(D.quiet.off?' checked':'')+'><span>No quiet hours</span></label></div></section>';
 h+='<div class="msx-save">'+(doc()&&doc().updatedAt?'<span class="muted sm">Last saved '+U.dmy(String(doc().updatedAt).slice(0,10))+'</span>':'')+U.btn('msx-reset','','Discard changes')+U.btn('msx-save','','Save settings',true)+'</div>';
 return h+'</div>';});
U.act('msx-addg',function(){readDom();D.groups.push({key:'g'+Date.now().toString(36),name:'',gid:'',active:true});U.paint();});
U.act('msx-delg',function(i){readDom();var g=D.groups[+i];if(!g)return;if(g.gid&&!confirm('Remove the group "'+(g.name||g.gid)+'"? Messages ticked for it will stop going there.'))return;D.groups.splice(+i,1);Object.keys(D.events).forEach(function(k){D.events[k].groups=D.events[k].groups.filter(function(x){return x!==g.key;});});U.paint();});
U.act('msx-reset',function(){D=null;U.paint();});
U.act('msx-save',async function(){readDom();var bad=D.groups.find(function(g){return!g.name;});if(bad){U.flash('Give every group a name.');return;}
 var keys={};D.groups.forEach(function(g){if(!g.key)g.key='g'+Math.random().toString(36).slice(2,8);keys[g.key]=1;});
 var body={key:'messaging',groups:D.groups,events:D.events,quiet:D.quiet},s=doc();
 try{if(s)await U.upd('app_settings',s.id,body);else await U.add('app_settings',body);U.flash('Message settings saved.');}catch(e){U.flash(err(e));}});
U.act('msx-acc',async function(){var u=document.getElementById('msx-user').value.trim(),p=document.getElementById('msx-pass').value;
 try{await api('account',{username:u,password:p});ST=null;U.flash('WhatsApp account saved.');load();}catch(e){U.flash(err(e));}});
U.act('msx-testg',async function(i){readDom();var g=D.groups[+i];if(!g||!g.gid){U.flash('Enter the group ID first.');return;}
 U.flash('Sending a test message to '+(g.name||'the group')+'…');try{await api('test',{to:g.gid,type:'group',name:g.name});U.flash('Test sent to '+(g.name||'the group')+'. Check the WhatsApp group.');}catch(e){U.flash(err(e));}});
U.act('msx-preview',async function(k){try{var r=await api('preview',{event:k});U.modal({title:title(k)+' – preview',fields:[],extra:function(){return r.text?'<pre class="msx-pre">'+E(r.text)+'</pre><p class="muted sm">WhatsApp shows *text* in bold.</p>':'<p>Nothing to send right now; the list is empty.</p>';},submit:'Close',save:async function(){return '';}});}catch(e){U.flash(err(e));}});
U.act('msx-run',async function(k){readDom();if(!confirm('Send "'+title(k)+'" to its groups now? Save the settings first if you changed the groups.'))return;try{var r=await api('run',{event:k});U.flash(r.empty?'Nothing to send; the list is empty.':'Sent. See the Message Log.');LOG=null;}catch(e){U.flash(err(e));}});
// ---------- log ----------
function loadLog(){if(logLoading)return;logLoading=true;api('log').then(function(r){LOG=r.rows||[];logLoading=false;U.paint();},function(e){LOG={error:err(e)};logLoading=false;U.paint();});}
function when(x){if(!x)return'';var d=new Date(x);return isNaN(d)?'':d.toLocaleString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit'});}
U.page('masters.message-log',function(){
 if(!LOG){loadLog();return U.loading;}
 if(LOG.error)return'<p class="mv-note warn">'+E(LOG.error)+'</p>';
 var st=U.st(),rows=LOG.filter(function(r){return(!st.status||r.status===st.status)&&(!st.ev||r.event===st.ev)&&U.match({q:st.q},[r.title,r.to_name,r.to,r.text].join(' '),'');});
 var n=function(s){return LOG.filter(function(r){return r.status===s;}).length;};
 return'<div class="msx"><div class="msx-save" style="justify-content:space-between"><span class="muted sm">Latest 300 messages. Failed messages are tried 3 times before they show as failed.</span>'+U.btn('msx-reload','','Refresh')+'</div>'+
  U.kpis('masters',[['Sent',n('sent'),'message-log'],['Waiting to send',n('queued'),'message-log'],['Failed',n('failed'),'message-log']])+
  U.bar(st,[{k:'status',label:'Status',first:'All statuses',opts:[{id:'sent',name:'Sent'},{id:'queued',name:'Waiting'},{id:'failed',name:'Failed'}]},{k:'ev',label:'Message',first:'All messages',opts:INSTANT.concat(SUMMARY).concat(['test']).map(function(k){return{id:k,name:k==='test'?'Test message':title(k)};})}],false)+
  U.table([['When',function(r){return when(r.sent_at||r.tried_at||r.created_at);}],['Message',function(r){return'<b>'+E(r.title||r.event)+'</b><details class="msx-det"><summary class="muted sm">Show text</summary><pre class="msx-pre">'+E(r.text||'')+'</pre></details>';}],['Sent to',function(r){return E(r.to_name||'')+'<div class="muted sm">'+(r.to_type==='mobile'?'Mobile ':'Group ')+E(r.to||'')+'</div>';}],['Status',function(r){return'<span class="ldx-pill '+(r.status==='sent'?'ok':r.status==='failed'?'bad':'warn')+'">'+(r.status==='sent'?'Sent':r.status==='failed'?'Failed':'Waiting')+'</span>'+(r.status!=='sent'&&r.response?'<div class="muted sm msx-err">'+E(String(r.response).slice(0,160))+'</div>':'');}],['',function(r){return r.status==='failed'&&r.event!=='test'?U.btn('msx-resend',r.id,'Resend',true):'';},'act']],rows,null,'No messages yet.')+'</div>';});
U.act('msx-reload',function(){LOG=null;U.paint();});
U.act('msx-resend',async function(id){try{await api('resend',{id:id});U.flash('Sent again. Check the status.');LOG=null;U.paint();}catch(e){U.flash(err(e));}});
})();
