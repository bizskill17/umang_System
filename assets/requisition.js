/* Material Requisition: material needed for a project, raised here and handed to the Inventory Management system. */
(function(){'use strict';
var U=window.U,P=U.P,E=U.esc,num=function(v){return Number(v)||0;};
var C='material_requisitions';
function ready(){return U.base([C,'projects',U.m('materials'),U.m('uom'),U.m('stores'),U.m('firm')]);}
function proj(id){return U.get('projects',id)||{};}
function cust(p){return U.nm('customers',p.customer_id)||p.customer||'';}
function projName(id){var p=proj(id);return p.no?p.no+(cust(p)?' · '+cust(p):''):'';}
function itemsText(r){return(r.items||[]).map(function(m){return m.name+' '+U.num(m.qty)+(m.unit?' '+m.unit:'');}).join(', ');}
var OPEN=function(r){return r.status!=='Canceled'&&r.status!=='Received';};

// ---------- item rows (material dropdown + quick add, qty, unit, note) ----------
function unitOpts(sel){var l=U.mact('uom').map(function(r){return r.name;});if(sel&&l.indexOf(sel)<0)l.push(sel);return '<option value="">Unit</option>'+l.map(function(n){return '<option'+(n===sel?' selected':'')+'>'+E(n)+'</option>';}).join('');}
function matOpts(sel,name){var h='<option value="">Select material</option>',found=false;U.mact('materials').forEach(function(r){if(r.id===sel)found=true;h+='<option value="'+E(r.id)+'"'+(r.id===sel?' selected':'')+'>'+E(r.name)+'</option>';});if(!found&&name)h+='<option value="'+E(sel||'')+'" selected>'+E(name)+'</option>';return h;}
function row(m,i){m=m||{};return '<tr class="mr-row"><td><div class="sel-add"><select class="mr-mat" id="mr_mat_'+i+'" aria-label="Material '+(i+1)+'">'+matOpts(m.material_id,m.name)+'</select><button type="button" class="sel-plus" data-a="mr-new-mat" data-id="'+i+'" title="Add new material" aria-label="Add new material">+</button></div></td>'
 +'<td><input class="mr-qty" type="number" min="0" step="0.001" aria-label="Quantity '+(i+1)+'" value="'+E(m.qty||'')+'"></td><td><select class="mr-unit" id="mr_unit_'+i+'" aria-label="Unit '+(i+1)+'">'+unitOpts(m.unit)+'</select></td>'
 +'<td><input class="mr-note" aria-label="Note '+(i+1)+'" maxlength="200" value="'+E(m.note||'')+'"></td><td><button type="button" class="mv-btn ghost sm" data-a="mr-del" data-id="'+i+'" aria-label="Remove material '+(i+1)+'">✕</button></td></tr>';}
function itemsHtml(v){var l=v.items||[],n=Math.max(l.length,v._rows||0,1),h='';for(var i=0;i<n;i++)h+=row(l[i],i);
 return '<h3 class="mi-h">Materials Required</h3><div class="mv-table-wrap"><table class="mv-table mi-table"><thead><tr><th scope="col">Material</th><th scope="col" class="mi-c">Quantity</th><th scope="col" class="mi-c">Unit</th><th scope="col">Note</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead><tbody id="mr-body">'+h+'</tbody></table></div><div class="mi-foot"><button type="button" class="mv-btn ghost sm" data-a="mr-add" data-id="">+ Add Material</button></div>';}
function readItems(fm,v){var rows=fm.querySelectorAll('tr.mr-row');if(!rows.length)return;v.items=Array.prototype.map.call(rows,function(r){var s=r.querySelector('.mr-mat'),o=s.options[s.selectedIndex];return{material_id:s.value,name:s.value&&o?o.textContent.trim():'',qty:r.querySelector('.mr-qty').value,unit:r.querySelector('.mr-unit').value,note:r.querySelector('.mr-note').value.trim()};});v._rows=rows.length;}
var FK='requisition.raise';
U.act('mr-add',function(){var f=P.forms[FK];if(!f)return;f.v._rows=document.querySelectorAll('#mr-body tr.mr-row').length+1;U.render();});
U.act('mr-del',function(i){var f=P.forms[FK],rows=document.querySelectorAll('#mr-body tr.mr-row');if(!f)return;if(rows.length<=1)rows[0].querySelectorAll('input').forEach(function(x){x.value='';});else rows[+i].remove();f.v._rows=Math.max(1,rows.length-1);U.render();});
document.addEventListener('change',function(e){var s=e.target;if(!s.classList||!s.classList.contains('mr-mat'))return;var r=s.closest('tr'),m=U.mact('materials').find(function(x){return x.id===s.value;});if(!m||!r||!m.unit_id)return;var u=r.querySelector('.mr-unit'),un=U.nm('uom',m.unit_id);if(un&&![].some.call(u.options,function(o){return o.value===un;}))u.add(new Option(un,un));u.value=un;});
U.act('mr-new-mat',function(i){U.modal({mod:'requisition',title:'New Material',fields:[{k:'name',label:'Material Name',type:'text',req:1},{k:'unit_id',label:'Unit',type:'select',opts:function(){return U.mact('uom');}},{k:'rate',label:'Default Rate (₹)',type:'number'}],
 validate:function(v){var n=String(v.name||'').trim().toLowerCase();if(U.mrows('materials').some(function(r){return String(r.name||'').trim().toLowerCase()===n;}))return'A material with this name already exists. Choose it from the list.';},
 save:async function(v){var added=await U.add(U.m('materials'),{name:String(v.name).trim(),unit_id:v.unit_id||'',rate:v.rate||'',status:'Active'});var s=document.getElementById('mr_mat_'+i);if(s){s.add(new Option(String(v.name).trim(),added.id,true,true));s.value=added.id;var u=s.closest('tr').querySelector('.mr-unit'),un=U.nm('uom',v.unit_id);if(un)u.value=un;}setTimeout(function(){U.render();},0);return'Material added.';}});});

// ---------- raise / edit ----------
function projOpts(){return U.rows('projects').filter(function(p){return p.status!=='Canceled'&&p.status!=='Completed';}).sort(function(a,b){return(b.seq||0)-(a.seq||0);}).map(function(p){return{id:p.id,name:projName(p.id)};});}
U.page(FK,function(){if(!ready())return U.loading;return U.formPage(FK,{init:function(){var A=window.UmangAuth||{},me=A.row||A.me;return{date:U.today(),requested_by:me&&me.id||'',items:[],_rows:3};},title:function(){return'';},submit:'Save Requisition',
 fields:function(v){return[{k:'project_id',label:'Project',type:'select',req:1,opts:projOpts,first:'Choose a project'},{k:'date',label:'Requisition Date',type:'date',req:1},{k:'required_by',label:'Required By',type:'date',req:1},{k:'store_id',label:'Deliver To (Store)',type:'select',opts:function(){return U.mact('stores').map(function(r){return{id:r.id,name:r.name+(r.location?' · '+r.location:'')};});}},{k:'requested_by',label:'Requested By',type:'select',opts:function(){return U.mact('users');}}];},
 extra:itemsHtml,readExtra:readItems,
 validate:function(v){if(v.required_by&&v.date&&v.required_by<v.date)return'Required By can’t be before the requisition date.';var l=(v.items||[]).filter(function(m){return m.material_id||num(m.qty);});if(!l.length)return'Add at least one material.';for(var i=0;i<l.length;i++){if(!l[i].material_id)return'Choose the material on every row that has a quantity.';if(!(num(l[i].qty)>0))return'Enter a quantity above zero for '+l[i].name+'.';}},
 save:async function(v){var items=(v.items||[]).filter(function(m){return m.material_id;}).map(function(m){return{material_id:m.material_id,name:m.name,qty:num(m.qty),unit:m.unit||'',note:m.note||''};});
  var b={project_id:v.project_id,customer_id:proj(v.project_id).customer_id||'',date:v.date,required_by:v.required_by,store_id:v.store_id||'',requested_by:v.requested_by,items:items};
  if(v._id){var r=U.get(C,v._id);await U.upd(C,v._id,b);return{go:'requisition.not-sent',msg:'Requisition '+r.no+' saved.'};}
  var fy=U.fy(v.date),n=await U.seq('mr-'+fy,U.maxSeq(C,'seq',function(r){return r.fy===fy;}));Object.assign(b,{fy:fy,seq:n,no:'MR-'+fy+'/'+n,status:'Not Sent'});await U.add(C,b);
  return{go:'requisition.not-sent',msg:'Requisition '+b.no+' saved. Send it to Inventory next.'};}});});
U.act('mr-edit',function(id){var r=U.get(C,id);if(!r)return;P.forms[FK]={v:Object.assign({},r,{_id:id,_rows:(r.items||[]).length,items:(r.items||[]).map(function(m){return Object.assign({},m,{qty:String(m.qty)});})}),err:'',saving:false};P.keepForm=true;U.go(FK);});

// ---------- status actions ----------
U.act('mr-sent',function(id){var r=U.get(C,id);if(!r)return;U.modal({mod:'requisition',title:'Mark '+r.no+' as Sent to Inventory',sub:E(projName(r.project_id)),v:{sent_on:U.today()},
 intro:function(){return'<p class="mf-hint">Use this after entering the requisition in the Inventory Management system. Automatic sending will replace this step once the inventory connection is set up.</p>';},
 fields:[{k:'sent_on',label:'Sent On',type:'date',req:1},{k:'inventory_ref',label:'Inventory Requisition No.',type:'text'}],
 validate:function(v){return v.sent_on<r.date?'Sent On can’t be before the requisition date.':null;},
 save:async function(v){await U.upd(C,id,{status:'Sent',sent_on:v.sent_on,inventory_ref:v.inventory_ref||''});return r.no+' marked as sent to Inventory.';}});});
U.act('mr-received',function(id){var r=U.get(C,id);if(!r)return;U.modal({mod:'requisition',title:'Mark '+r.no+' as Received',sub:E(projName(r.project_id)),v:{received_on:U.today()},
 fields:[{k:'received_on',label:'Received On',type:'date',req:1}],validate:function(v){return v.received_on<(r.sent_on||r.date)?'Received On can’t be before it was sent.':null;},
 save:async function(v){await U.upd(C,id,{status:'Received',received_on:v.received_on});return r.no+' marked as received.';}});});
U.act('mr-cancel',function(id){var r=U.get(C,id);if(!r)return;U.modal({mod:'requisition',title:'Cancel '+r.no,sub:E(projName(r.project_id)),fields:[{k:'cancel_reason',label:'Reason',type:'textarea',req:1}],submit:'Cancel Requisition',
 save:async function(v){await U.upd(C,id,{status:'Canceled',cancel_reason:v.cancel_reason,canceled_on:U.today()});return r.no+' canceled.';}});});

// ---------- lists ----------
function list(filter,empty,actions){return function(){if(!ready())return U.loading;var st=U.st(),base=U.rows(C).filter(filter);
 var rows=base.filter(function(r){return(!st.project||r.project_id===st.project)&&(!st.store||r.store_id===st.store)&&(!st.status||r.status===st.status)&&U.match(st,[r.no,projName(r.project_id),itemsText(r),U.user(r.requested_by),r.inventory_ref,U.nm('stores',r.store_id)].join(' '),r.date);}).sort(function(a,b){return(b.seq||0)-(a.seq||0);});
 var today=U.today(),cols=[['Req. No.',function(r){return '<b class="nw">'+E(r.no)+'</b>';}],['Date',function(r){return U.dmy(r.date);}],['Project · Client',function(r){return E(projName(r.project_id));}],
  ['Materials',function(r){return '<div class="mi-list">'+(r.items||[]).map(function(m){return '<div>'+E(m.name)+' <span class="dim">'+U.num(m.qty)+(m.unit?' '+E(m.unit):'')+'</span></div>';}).join('')+'</div>';}],
  ['Required By',function(r){var late=OPEN(r)&&r.required_by&&r.required_by<today;return '<span'+(late?' class="mr-late"':'')+'>'+U.dmy(r.required_by)+(late?' · overdue':'')+'</span>';}],['Deliver To',function(r){return E(U.nm('stores',r.store_id));}],['Requested By',function(r){return E(U.user(r.requested_by));}],
  ['Inventory No.',function(r){return E(r.inventory_ref||'');}],['Status',function(r){return U.pill(r.status);}]];
 if(actions&&!U.ro())cols.push(['Action',actions,'act']);
 var projects=[...new Set(base.map(function(r){return r.project_id;}))].map(function(id){return{id:id,name:projName(id)};});
 var sel=[{k:'project',label:'Project',first:'All projects',opts:projects},{k:'store',label:'Store',first:'All stores',opts:U.mact('stores')}];
 if(P.cur==='requisition.all')sel.push({k:'status',label:'Status',first:'All statuses',opts:['Not Sent','Sent','Received','Canceled'].map(function(x){return{id:x,name:x};})});
 return U.bar(st,sel,true)+U.table(cols,rows,null,base.length?'No requisition matches these filters.':empty)+U.count(rows.length,'requisition');};}
U.page('requisition.not-sent',list(function(r){return r.status==='Not Sent';},'No requisitions waiting to be sent.',function(r){return U.btn('mr-sent',r.id,'Mark Sent',true)+U.btn('mr-edit',r.id,'Edit')+U.btn('mr-cancel',r.id,'Cancel');}));
U.page('requisition.sent',list(function(r){return r.status==='Sent';},'No requisitions are waiting at Inventory.',function(r){return U.btn('mr-received',r.id,'Received',true)+U.btn('mr-cancel',r.id,'Cancel');}));
U.page('requisition.received',list(function(r){return r.status==='Received';},'No requisitions received yet.'));
U.page('requisition.all',list(function(){return true;},'No requisitions yet. Use Raise Requisition.',function(r){return r.status==='Not Sent'?U.btn('mr-edit',r.id,'Edit'):'';}));
})();
