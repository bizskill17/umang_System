/* Master Data → Data Migration: back up the current masters, then import the prepared master file (administrator only). */
(function(){'use strict';
var U=window.U;if(!U||!U.page)return;
var E=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
var NAMES={'state':'States','city':'Cities','customer-category':'Customer Categories','customer-subcategory':'Customer Sub-Categories','designation':'Designations','users':'Users','vendors':'Vendors','lead-category':'Lead Categories','lead-subcategory':'Lead Sub-Categories','lead-sources':'Lead Sources','machines':'Machines','vehicles':'Vehicles','customers':'Customers','firm':'Firms'};
var REC={leads:'Leads',quotations:'Quotations',projects:'Projects',recce:'Recce',designs:'Designs',jobs:'Jobs',dispatches:'Dispatches',invoices:'Invoices',complaints:'Complaints',work_orders:'Work Orders',material_requisitions:'Requisitions'};
var S={status:null,err:'',pkg:null,file:'',busy:false,result:null,backedUp:false};
function srv(){return window.UmangServer&&window.UmangServer.migrate;}
async function loadStatus(){if(!srv()){S.err='Data Migration needs the live server.';U.paint();return;}try{S.status=await window.UmangServer.migrate({cmd:'status'});S.err='';}catch(e){S.err=(e&&e.msg)||'Could not read the current data.';}U.paint();}
function nm(k){return NAMES[k]||k;}
function save(name,text){var blob=new Blob([text],{type:'application/json'});if(U.downloads){U.downloads.save({filename:name,data:blob}).catch(function(){});return;}var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1000);}
U.page('masters.data-migration',function(){
 if(!S.status&&!S.err&&!S.loading){S.loading=1;loadStatus();}
 if(S.err)return'<div class="ldx"><p class="mv-note warn">'+E(S.err)+'</p></div>';
 if(!S.status)return U.loading;
 var st=S.status,P=S.pkg,h='<div class="ldx">';
 h+='<section class="ldx-panel ds-card"><div class="ldx-ph"><div><h2>1. Back up the current masters</h2><p>Download a copy of every master as it is now, before anything is cleared.</p></div></div>'+
  '<p class="ds-acts">'+U.btn('mig-backup','','Download backup',!S.backedUp)+(S.backedUp?' <span class="ldx-pill ok">Backup downloaded</span>':'')+'</p>';
 var recs=Object.keys(REC).filter(function(k){return st.records[k];});
 h+='<p class="muted sm">Records already in the app: '+(recs.length?recs.map(function(k){return E(REC[k])+' '+st.records[k];}).join(' · ')+'. Clearing masters breaks their links to customers, users and vendors.':'none.')+'</p></section>';
 h+='<section class="ldx-panel ds-card"><div class="ldx-ph"><div><h2>2. Choose the import file</h2><p>The prepared master file (umang-masters-import.json). Sheets are never changed.</p></div></div><label class="mv-btn ghost sm" style="cursor:pointer">Choose file<input type="file" id="mig-file" accept=".json,application/json" hidden></label> <span class="muted sm">'+E(S.file||'No file chosen')+'</span>';
 if(P){var keys=Object.keys(P.rows);
  h+='<div class="ldx-tw"><table class="ldx-t narrow"><thead><tr><th>Master</th><th class="num">In the app now</th><th class="num">In the file</th><th>On import</th></tr></thead><tbody>'+
   keys.map(function(k){var c=(P.clear||[]).indexOf(k)>=0;return'<tr><td>'+E(nm(k))+'</td><td class="num">'+(st.masters[k]||0)+'</td><td class="num">'+P.rows[k].length+'</td><td>'+(k==='firm'?'Matched by name, kept':k==='users'?'Cleared except '+E((P.keep_users||[]).join(', '))+' and you':c?'Cleared, then imported':'Added')+'</td></tr>';}).join('')+'</tbody></table></div>';}
 h+='</section>';
 if(P&&!S.result){h+='<section class="ldx-panel ds-card"><div class="ldx-ph"><div><h2>3. Import</h2><p>Everything is written in one step. If anything fails, nothing changes.</p></div></div>'+
  '<label class="ds-row"><input type="checkbox" id="mig-clear" checked><span><b>Clear these masters first</b><small>'+E((P.clear||[]).map(nm).join(', '))+'. Firms, Items, UOM, GST and User Roles are never cleared.</small></span></label>'+
  '<p><label>Type <b>CLEAR</b> to confirm <input id="mig-confirm" autocomplete="off" style="width:120px"></label></p>'+
  '<p class="ds-acts">'+(S.busy?'<span class="muted">Importing… keep this page open.</span>':U.btn('mig-run','','Start import',true))+'</p></section>';}
 if(S.result){var r=S.result;h+='<section class="ldx-panel ds-card"><div class="ldx-ph"><div><h2>Import finished</h2><p>The masters below are now in the app.</p></div><span class="ldx-pill ok">Done</span></div><div class="ldx-tw"><table class="ldx-t narrow"><thead><tr><th>Master</th><th class="num">Cleared</th><th class="num">Added</th><th class="num">Kept / matched</th></tr></thead><tbody>'+
  Object.keys(Object.assign({},r.cleared,r.added,r.kept)).map(function(k){return'<tr><td>'+E(nm(k))+'</td><td class="num">'+(r.cleared[k]||0)+'</td><td class="num">'+(r.added[k]||0)+'</td><td class="num">'+(r.kept[k]||0)+'</td></tr>';}).join('')+'</tbody></table></div></section>';}
 return h+'</div>';});
U.act('mig-backup',async function(){try{var b=await window.UmangServer.migrate({cmd:'backup'});save('umang-masters-backup-'+new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')+'.json',JSON.stringify(b));S.backedUp=true;U.paint();}catch(e){U.flash((e&&e.msg)||'Could not make the backup.');}});
document.addEventListener('change',function(e){if(e.target.id!=='mig-file'||!e.target.files[0])return;var f=e.target.files[0],rd=new FileReader();rd.onload=function(){try{var p=JSON.parse(rd.result);if(p.kind!=='umang-master-import'||!p.rows)throw 0;S.pkg=p;S.file=f.name;S.result=null;}catch(x){S.pkg=null;S.file='';U.flash('That file is not a master import file.');}U.paint();};rd.readAsText(f);});
U.act('mig-run',async function(){var clear=document.getElementById('mig-clear').checked,conf=(document.getElementById('mig-confirm').value||'').trim();
 if(clear&&conf!=='CLEAR'){U.flash('Type CLEAR to confirm.');return;}
 if(clear&&!S.backedUp){U.flash('Download the backup first.');return;}
 S.busy=true;U.paint();
 try{var r=await window.UmangServer.migrate({cmd:'import',pkg:S.pkg,clear:clear,confirm:conf});S.result=r.result;S.status=null;S.loading=0;U.flash('Masters imported.');}catch(e){U.flash((e&&e.msg)||'The import failed. Nothing was changed.');}
 S.busy=false;U.paint();});
})();
