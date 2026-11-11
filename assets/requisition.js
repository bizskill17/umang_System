/* Material Requisition: raised here on the same form as the Inventory Management System (IMS),
   using IMS masters, sent straight to the IMS, and its status read back from there. */
(function(){'use strict';
var U=window.U,P=U.P,E=U.esc,num=function(v){return Number(v)||0;};
var C='material_requisitions',FK='requisition.raise';
function ready(){return U.base([C]);}
function fail(m){var e=new Error(m);e.msg=m;return e;}
function ims(cmd,extra){if(!window.UmangServer||!window.UmangServer.ims)return Promise.reject(fail('The Inventory connection needs the connected database service.'));return window.UmangServer.ims(Object.assign({cmd:cmd},extra||{}));}

// ---------- IMS masters (loaded once per visit, refreshable) ----------
var M=null,MLOAD=null,MERR='';
function loadMasters(fresh){if(MLOAD)return MLOAD;MERR='';MLOAD=ims('masters',fresh?{fresh:1}:{}).then(function(d){M=d;M.byItemName={};(d.items||[]).forEach(function(it){var s={};try{s=JSON.parse(it.specificationsJson||'{}')||{};}catch(e){}it.specs=s;(M.byItemName[it.itemNameId]=M.byItemName[it.itemNameId]||[]).push(it);});MLOAD=null;U.render();}).catch(function(e){MERR=(e&&(e.msg||e.message))||'Could not load data from the Inventory system.';MLOAD=null;U.render();});return MLOAD;}
U.act('mr-reload',function(){M=null;loadMasters(true);U.render();});
function by(list,id){return(list||[]).find(function(x){return String(x.id)===String(id);})||null;}
function nm(list,id){var r=by(list,id);return r?r.name:'';}
function opts(list,label){return(list||[]).map(function(r){return{id:String(r.id),name:label?label(r):r.name};}).sort(function(a,b){return String(a.name).localeCompare(String(b.name));});}
function specName(id){return nm(M.specifications,id)||id;}
function specIds(itemNameId){var n=by(M.itemNames,itemNameId);return n&&Array.isArray(n.specificationIds)?n.specificationIds.map(String).filter(Boolean):[];}
function low(v){return String(v==null?'':v).trim().toLocaleLowerCase();}
// Values offered for one specification: only those of items that still match the specifications already picked.
function specValues(row,sid){var c=(M.byItemName[row.item_name_id]||[]),out=[];c.forEach(function(it){var ok=Object.keys(row.specs||{}).every(function(k){return k===sid||!row.specs[k]||low(it.specs[k])===low(row.specs[k]);});var v=String(it.specs[sid]==null?'':it.specs[sid]).trim();if(ok&&v&&out.indexOf(v)<0)out.push(v);});return out.sort();}
function resolveItem(row){var c=M.byItemName[row.item_name_id]||[];if(!c.length)return null;var ids=specIds(row.item_name_id);if(!ids.length||c.length===1)return c[0];if(ids.some(function(s){return!String((row.specs||{})[s]||'').trim();}))return null;return c.find(function(it){return ids.every(function(s){return low(it.specs[s])===low(row.specs[s]);});})||null;}
function specText(it){return it?Object.keys(it.specs).map(function(k){var v=String(it.specs[k]==null?'':it.specs[k]).trim();return v?specName(k)+': '+v:'';}).filter(Boolean).join('\n'):'';}

// ---------- item rows ----------
function sel(cls,id,label,list,val,first,live){return '<select class="'+cls+'" id="'+id+'" aria-label="'+E(label)+'"'+(live?' data-live="1"':'')+'><option value="">'+E(first)+'</option>'+list.map(function(o){var v=typeof o==='string'?o:o.id,t=typeof o==='string'?o:o.name;return '<option value="'+E(v)+'"'+(String(v)===String(val||'')?' selected':'')+'>'+E(t)+'</option>';}).join('')+'</select>';}
var INAMES=null;
function rowHtml(r,i){r=r||{specs:{}};var ids=r.item_name_id?specIds(r.item_name_id):[],unit=(by(M.itemNames,r.item_name_id)||{}).unitName||'',it=r.item_name_id?resolveItem(r):null;
 var spec=r.item_name_id?(ids.length?'<div class="mr-specs">'+ids.map(function(sid){return '<label class="mr-spec"><span>'+E(specName(sid))+'</span>'+sel('mr-sv','mr_sv_'+i+'_'+sid,specName(sid)+' for item '+(i+1),specValues(r,sid),(r.specs||{})[sid],'Select value…',1)+'</label>';}).join('')+'</div>':'<span class="dim">No specifications</span>')+(ids.length&&!it&&ids.every(function(s){return(r.specs||{})[s];})?'<p class="mr-nomatch">No item in the Inventory matches these specifications.</p>':''):'<span class="dim">Select the item first</span>';
 return '<tr class="mr-row" data-i="'+i+'"><td>'+sel('mr-in','mr_in_'+i,'Item '+(i+1),INAMES,r.item_name_id,'Search item…',1)+'</td><td>'+spec+'</td><td><input class="mr-qty" type="number" min="0" step="any" aria-label="Quantity '+(i+1)+'" value="'+E(r.qty||'')+'">'+(unit?'<span class="mr-unit">'+E(unit)+'</span>':'')+'</td><td><button type="button" class="mv-btn ghost sm" data-a="mr-del" data-id="'+i+'" aria-label="Remove item '+(i+1)+'">✕</button></td></tr>';}
function itemsHtml(v){INAMES=opts(M.itemNames);var l=v.items||[],n=Math.max(l.length,1),h='';for(var i=0;i<n;i++)h+=rowHtml(l[i],i);
 return '<div class="mr-items-head"><h3 class="mi-h">Items</h3><button type="button" class="mv-btn ghost sm" data-a="mr-add" data-id="">+ Add Item</button></div><div class="mv-table-wrap"><table class="mv-table mr-table"><thead><tr><th scope="col">Item</th><th scope="col">Specification</th><th scope="col" class="mr-qcol">Qty</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead><tbody id="mr-body">'+h+'</tbody></table></div><p class="mf-hint">Fill every specification of an item so the exact Inventory item is found.</p><div class="mf-field mr-remarks"><label for="mr_remarks">Remarks</label><textarea id="mr_remarks" name="mr_remarks" rows="3">'+E(v.remarks||'')+'</textarea></div>';}
function readItems(fm,v){if(fm.elements.mr_remarks)v.remarks=fm.elements.mr_remarks.value;var rows=fm.querySelectorAll('tr.mr-row');if(!rows.length)return;var old=v.items||[];v.items=Array.prototype.map.call(rows,function(r,k){var i=+r.getAttribute('data-i'),inm=r.querySelector('.mr-in').value,prev=old[i]||{},specs={};
  if(inm&&inm===prev.item_name_id)r.querySelectorAll('.mr-sv').forEach(function(s){var sid=s.id.split('_').slice(3).join('_');if(s.value)specs[sid]=s.value;});
  return{item_name_id:inm,specs:specs,qty:r.querySelector('.mr-qty').value};});}
U.act('mr-add',function(){var f=P.forms[FK];if(!f)return;U.render();f=P.forms[FK];f.v.items=(f.v.items&&f.v.items.length?f.v.items:[{specs:{}}]).concat([{specs:{}}]);U.paint();});
U.act('mr-del',function(i){var f=P.forms[FK];if(!f)return;U.render();f=P.forms[FK];var l=f.v.items||[];if(l.length>1)l.splice(+i,1);else l[0]={specs:{}};U.paint();});

// ---------- raise ----------
var TYPES=[{id:'Inhouse',name:'Inhouse'},{id:'Vendor',name:'Vendor'}];
U.page(FK,function(){if(!ready())return U.loading;
 if(!M){if(!MLOAD&&!MERR)loadMasters();return MERR?'<div class="mv-note warn"><p>'+E(MERR)+'</p><p><button type="button" class="mv-btn primary" data-a="mr-reload" data-id="">Try again</button></p></div>':'<p class="mv-note">Loading items and masters from the Inventory system…</p>';}
 return U.formPage(FK,{init:function(){return{date:U.today(),request_type:'Inhouse',items:[{specs:{}}]};},title:function(){return'';},submit:'Send to Inventory',
  fields:function(v){var cust=by(M.customers,v.ims_cust);if(!v.ims_firm&&!v._firmTouched){var f0=(M.firms||[])[0];if(f0)v.ims_firm=String(f0.id);}var fs=(M.stores||[]).filter(function(s){return String(s.firmId)===String(v.ims_firm);});if(v.ims_store&&!fs.some(function(s){return String(s.id)===String(v.ims_store);}))v.ims_store='';if(!v.ims_store&&fs.length){v.ims_store=String(fs[0].id);}v._firmTouched=1;if(!v.request_type)v.request_type='Inhouse';return[
   {k:'date',label:'Date',type:'date'},
   {k:'ims_firm',label:'Firm',type:'select',live:1,opts:function(){return opts(M.firms);}},
   {k:'ims_store',label:'Store',type:'select',opts:function(){return opts((M.stores||[]).filter(function(s){return!v.ims_firm||String(s.firmId)===String(v.ims_firm);}),function(s){return s.name+(s.location?' · '+s.location:'');});},first:v.ims_firm?'Select store':'Select the firm first'},
   {k:'ims_dept',label:'Department',type:'select',opts:function(){return opts(M.departments);}},
   {k:'ims_cust',label:'Customer',type:'select',live:1,opts:function(){return opts(M.customers);}},
   {k:'ims_proj',label:'Project',type:'select',opts:function(){return opts((M.projects||[]).filter(function(p){return!cust||low(p.clientName)===low(cust.name);}));}},
   {k:'request_type',label:'Request By Type',type:'select',live:1,opts:function(){return TYPES;}},
   {k:'requested_by',label:v.request_type==='Vendor'?'Requested By (Vendor)':'Requested By',type:'select',req:1,opts:function(){return v.request_type==='Vendor'?opts((M.suppliers||[]).filter(function(s){return s.isVendor===undefined||s.isVendor===null||!!+s.isVendor||s.isVendor===true;})):opts(M.users);}},
   {k:'entered_by',label:'Entered By',type:'select',req:1,opts:function(){return opts(M.users);}}];},
  extra:itemsHtml,readExtra:readItems,
  validate:function(v){if(!v.date)return'Enter the date.';if(!v.ims_firm)return'Choose the firm — the Inventory system needs it.';if(!v.ims_store)return'Choose the store — the Inventory system needs it.';if(!v.ims_dept)return'Choose the department — the Inventory system needs it.';var l=(v.items||[]).filter(function(r){return r.item_name_id||num(r.qty);});if(!l.length)return'Add at least one item.';for(var i=0;i<l.length;i++){var r=l[i],n=nm(M.itemNames,r.item_name_id);if(!r.item_name_id)return'Choose the item on every row that has a quantity.';if(!resolveItem(r))return'Fill all specifications of '+n+' (or pick values that exist in the Inventory).';if(!(num(r.qty)>0))return'Enter a quantity above zero for '+n+'.';}},
  save:async function(v){var rows=(v.items||[]).filter(function(r){return r.item_name_id;}).map(function(r){var it=resolveItem(r);return{itemId:String(it.id),quantity:num(r.qty),specification:specText(it),name:nm(M.itemNames,r.item_name_id),unit:(by(M.itemNames,r.item_name_id)||{}).unitName||''};});
   var dept=nm(M.departments,v.ims_dept),req={date:v.date,firmId:v.ims_firm,storeId:v.ims_store,department:dept,customerId:v.ims_cust||'',projectId:v.ims_proj||'',requestByType:v.request_type,requestByUserId:v.request_type==='Inhouse'?v.requested_by:'',requestBySupplierId:v.request_type==='Vendor'?v.requested_by:'',enteredByUserId:v.entered_by,remarks:v.remarks||'',items:rows.map(function(r){return{itemId:r.itemId,quantity:r.quantity,specification:r.specification};})};
   var reqBy=v.request_type==='Vendor'?nm(M.suppliers,v.requested_by):nm(M.users,v.requested_by);
   var added=await U.add(C,{no:'',ims_ref:req,date:v.date,firm:nm(M.firms,v.ims_firm),store:nm(M.stores,v.ims_store),department:dept,customer:nm(M.customers,v.ims_cust),project:nm(M.projects,v.ims_proj),request_type:v.request_type,requested_by:reqBy,entered_by:nm(M.users,v.entered_by),remarks:v.remarks||'',
    items:rows.map(function(r){return{ims_item_id:r.itemId,name:r.name,specification:r.specification,qty:r.quantity,unit:r.unit,issued:0};}),status:'Not Sent'});
   // Saved here first; the IMS then gives the one requisition number used in both places.
   try{var res=await ims('send',{id:added.id});return{go:'requisition.pending',msg:'Requisition '+res.requestNo+' sent to the Inventory system.'};}
   catch(e){return{go:'requisition.not-sent',msg:'Saved here but not sent to Inventory: '+((e&&(e.msg||e.message))||'connection problem')};}}});});

// ---------- send / status with the IMS ----------
var SENDING={};
U.act('mr-send',async function(id){if(SENDING[id])return;SENDING[id]=1;U.flash('Sending to the Inventory system…');try{var res=await ims('send',{id:id});U.flash('Requisition '+res.requestNo+' sent to the Inventory system.');}catch(e){U.flash((e&&(e.msg||e.message))||'Could not send.');}finally{delete SENDING[id];}});
var LAST=0,SYNC=false;
async function sync(force){if(SYNC||(!force&&Date.now()-LAST<60000))return;var open=U.rows(C).filter(function(r){return r.ims_id&&r.status==='Pending';});if(!open.length){LAST=Date.now();if(force)U.flash('Nothing pending at Inventory.');return;}SYNC=true;
 try{var d=await ims('status',{ids:open.map(function(r){return r.ims_id;})});LAST=Date.now();
  var removed=0;
  for(var i=0;i<open.length;i++){var r=open[i],s=(d.status||{})[r.ims_id];if(!s)continue;var up={};
   if(s.items){var items=(r.items||[]).map(function(it){var m=s.items.find(function(x){return x.itemId===it.ims_item_id;});return m?Object.assign({},it,{issued:m.issued}):it;});if(JSON.stringify(items)!==JSON.stringify(r.items))up.items=items;}
   if(s.status&&s.status!=='Pending'&&s.status!=='Not found'){up.status='Closed';up.closed_at=U.now();up.ims_status=s.status;up.items=(up.items||r.items||[]).map(function(it){return Object.assign({},it,{issued:Math.max(num(it.issued),num(it.qty))});});}
   // Deleted in the Inventory system: remove it here too (after a second check, so a passing glitch can't delete anything).
   if(s.status==='Not found'){if(r.missing){await U.del(C,r.id);removed++;continue;}up.missing=true;}if(s.status!=='Not found'&&r.missing)up.missing=false;
   if(Object.keys(up).length)await U.upd(C,r.id,up);}
  if(removed)U.flash(removed+' requisition'+(removed>1?'s were':' was')+' deleted in the Inventory system, so '+(removed>1?'they were':'it was')+' removed here too.');else if(force)U.flash('Status updated from the Inventory system.');}
 catch(e){if(force)U.flash((e&&(e.msg||e.message))||'Could not reach the Inventory system.');}
 finally{SYNC=false;}}
U.act('mr-sync',function(){sync(true);});
U.act('mr-cancel',function(id){var r=U.get(C,id);if(!r||r.ims_id)return;U.modal({mod:'requisition',title:'Cancel requisition',fields:[{k:'cancel_reason',label:'Reason',type:'textarea',req:1}],submit:'Cancel Requisition',
 save:async function(v){await U.upd(C,id,{status:'Canceled',cancel_reason:v.cancel_reason,canceled_on:U.today()});return'Requisition canceled.';}});});
// ---------- lists ----------
function itemsCell(r){return '<div class="mi-list">'+(r.items||[]).map(function(m){var done=num(m.issued);return '<div><b>'+E(m.name)+'</b> <span class="dim">'+U.num(m.qty)+(m.unit?' '+E(m.unit):'')+(done?' · issued '+U.num(done):'')+'</span>'+(m.specification?'<div class="dim mr-spec-t">'+E(m.specification).replace(/\n/g,' · ')+'</div>':'')+'</div>';}).join('')+'</div>';}
function list(filter,empty,withSync){return function(){if(!ready())return U.loading;if(withSync)sync(false);var st=U.st(),base=U.rows(C).filter(filter);
 var rows=base.filter(function(r){return(!st.firm||r.firm===st.firm)&&(!st.store||r.store===st.store)&&(!st.dept||r.department===st.dept)&&U.match(st,[r.no,r.customer,r.project,r.requested_by,r.store,r.department,(r.items||[]).map(function(m){return m.name+' '+m.specification;}).join(' ')].join(' '),r.date);}).sort(function(a,b){return String(b.sent_at||b.createdAt||'').localeCompare(String(a.sent_at||a.createdAt||''));});
 var cols=[['Req. No.',function(r){return '<b class="nw">'+E(r.no||'—')+'</b>'+(r.missing?'<div class="mr-late">Not found in Inventory · will be removed</div>':'');}],['Date',function(r){return U.dmy(r.date);}],['Firm · Store',function(r){return E(r.firm)+'<div class="dim">'+E(r.store)+'</div>';}],['Department',function(r){return E(r.department);}],['Customer · Project',function(r){return E(r.customer||'—')+'<div class="dim">'+E(r.project)+'</div>';}],['Items',itemsCell],['Requested By',function(r){return E(r.requested_by)+'<div class="dim">'+E(r.request_type)+'</div>';}],['Status',function(r){return U.pill(r.status==='Closed'?'Issued':r.status==='Pending'?'Pending at Inventory':r.status)+(r.status==='Not Sent'&&r.send_error?'<div class="mr-late">'+E(r.send_error)+'</div>':'');}]];
 if(!U.ro())cols.push(['Action',function(r){return r.status==='Not Sent'?U.btn('mr-send',r.id,'Send Again',true)+U.btn('mr-cancel',r.id,'Cancel'):'';},'act']);
 var uniqOpts=function(k){var s=[];base.forEach(function(r){if(r[k]&&s.indexOf(r[k])<0)s.push(r[k]);});return s.sort().map(function(x){return{id:x,name:x};});};
 return U.bar(st,[{k:'firm',label:'Firm',first:'All firms',opts:uniqOpts('firm')},{k:'store',label:'Store',first:'All stores',opts:uniqOpts('store')},{k:'dept',label:'Department',first:'All departments',opts:uniqOpts('department')}],true)
  +(withSync?'<p>'+U.btn('mr-sync','','Refresh status from Inventory')+'</p>':'')+U.table(cols,rows,null,base.length?'No requisition matches these filters.':empty)+U.count(rows.length,'requisition');};}
U.page('requisition.not-sent',list(function(r){return r.status==='Not Sent';},'Every requisition has reached the Inventory system.'));
U.page('requisition.pending',list(function(r){return r.status==='Pending';},'No requisitions are pending at Inventory.',true));
U.page('requisition.closed',list(function(r){return r.status==='Closed';},'No requisitions have been fully issued yet.'));
U.page('requisition.all',list(function(){return true;},'No requisitions yet. Use Raise Requisition.',true));
})();
