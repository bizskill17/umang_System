/* Master Data → Data Migration: back up the current masters, then import the prepared master file (administrator only). */
(function(){'use strict';
var U=window.U;if(!U||!U.page)return;
var E=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
var NAMES={'state':'States','city':'Cities','customer-category':'Customer Categories','customer-subcategory':'Customer Sub-Categories','designation':'Designations','users':'Users','vendors':'Vendors','lead-category':'Lead Categories','lead-subcategory':'Lead Sub-Categories','lead-sources':'Lead Sources','machines':'Machines','vehicles':'Vehicles','customers':'Customers','firm':'Firms'};
var REC={leads:'Leads',quotations:'Quotations',projects:'Projects',recce:'Recce',designs:'Designs',jobs:'Jobs',dispatches:'Dispatches',invoices:'Invoices',complaints:'Complaints',work_orders:'Work Orders',material_requisitions:'Requisitions'};
var S={status:null,err:'',pkg:null,file:'',busy:'',done:{},backedUp:false,clear:true,conf:''};
var ORDER=['firm','state','city','customer-category','customer-subcategory','designation','users','vendors','lead-category','lead-subcategory','lead-sources','machines','vehicles','customers'];
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
 if(P){var keys=ORDER.filter(function(k){return P.rows[k];}).concat(Object.keys(P.rows).filter(function(k){return ORDER.indexOf(k)<0;}));
  h+='<label class="ds-row"><input type="checkbox" id="mig-clear"'+(S.clear?' checked':'')+'><span><b>Clear each master before importing it</b><small>Firms are matched by name and kept. Users '+E((P.keep_users||[]).join(', '))+' and you are kept. Items, UOM, GST and User Roles are never touched.</small></span></label>'+
   '<p><label>Type <b>CLEAR</b> to confirm <input id="mig-confirm" autocomplete="off" style="width:120px" value="'+E(S.conf||'')+'"></label></p>';
  h+='<p class="ds-acts">'+(S.busy?'<span class="muted">Importing '+E(nm(S.busy))+'… keep this page open.</span>':U.btn('mig-all','','Import all masters (backup first)',true))+'</p>';
  h+='<div class="ldx-tw"><table class="ldx-t narrow"><thead><tr><th>#</th><th>Master</th><th class="num">In the app now</th><th class="num">In the file</th><th>Result</th><th></th></tr></thead><tbody>'+
   keys.map(function(k,i){var d=S.done[k],res=d?'<span class="ldx-pill ok">Done</span> '+(d.cleared[k]?'cleared '+d.cleared[k]+', ':'')+'added '+(d.added[k]||0)+(d.kept[k]?', kept '+d.kept[k]:''):'<span class="muted sm">'+(k==='firm'?'Matched by name, kept':'Not imported yet')+'</span>';
    return'<tr><td>'+(i+1)+'</td><td><b>'+E(nm(k))+'</b></td><td class="num">'+(st.masters[k]||0)+'</td><td class="num">'+P.rows[k].length+'</td><td>'+res+'</td><td>'+(S.busy===k?'<span class="muted sm">Importing…</span>':S.busy?'':U.btn('mig-one',k,d?'Import again':'Import',!d))+'</td></tr>';}).join('')+'</tbody></table></div>'+
   '<p class="muted sm">Import from the top down: cities need states, customers need cities and categories.</p>';}
 h+='</section>';
 return h+'</div>';});
U.act('mig-backup',async function(){try{await doBackup();U.paint();}catch(e){U.flash((e&&e.msg)||'Could not make the backup.');}});
document.addEventListener('change',function(e){if(e.target.id!=='mig-file'||!e.target.files[0])return;var f=e.target.files[0],rd=new FileReader();rd.onload=function(){try{var p=JSON.parse(rd.result);if(p.kind!=='umang-master-import'||!p.rows)throw 0;S.pkg=p;S.file=f.name;S.done={};}catch(x){S.pkg=null;S.file='';U.flash('That file is not a master import file.');}U.paint();};rd.readAsText(f);});
document.addEventListener('input',function(e){if(e.target.id==='mig-confirm')S.conf=e.target.value;});
document.addEventListener('change',function(e){if(e.target.id==='mig-clear')S.clear=e.target.checked;});
async function doBackup(){var b=await window.UmangServer.migrate({cmd:'backup'});save('umang-masters-backup-'+new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')+'.json',JSON.stringify(b));S.backedUp=true;}
U.act('mig-all',async function(){var conf=(S.conf||'').trim();
 if(S.clear&&conf!=='CLEAR'){U.flash('Type CLEAR to confirm.');return;}
 try{if(!S.backedUp)await doBackup();}catch(e){U.flash('Could not make the backup, so nothing was imported.');return;}
 var keys=ORDER.filter(function(k){return S.pkg.rows[k]&&!S.done[k];});
 for(var i=0;i<keys.length;i++){var ok=await runOne(keys[i]);if(!ok){U.flash(nm(keys[i])+' failed. The masters above it were imported; fix the error and click Import all again.');return;}}
 U.flash('All masters imported.');});
async function runOne(k){var clear=S.clear&&k!=='firm',conf=(S.conf||'').trim();
 var one={kind:S.pkg.kind,version:S.pkg.version,built:S.pkg.built,keep_users:S.pkg.keep_users,clear:(S.pkg.clear||[]).indexOf(k)>=0?[k]:[],rows:{}};one.rows[k]=S.pkg.rows[k];
 S.busy=k;U.paint();var ok=true;
 try{var r=await window.UmangServer.migrate({cmd:'import',pkg:one,clear:clear,confirm:conf});S.done[k]=r.result;S.status=await window.UmangServer.migrate({cmd:'status'});}catch(e){ok=false;U.flash(nm(k)+': '+((e&&e.msg)||'the import failed. Nothing was changed.'));}
 S.busy='';U.paint();return ok;}
U.act('mig-one',async function(k){var clear=S.clear&&k!=='firm',conf=(S.conf||'').trim();
 if(clear&&conf!=='CLEAR'){U.flash('Type CLEAR to confirm.');return;}
 if(clear&&!S.backedUp){U.flash('Download the backup first.');return;}
 if(await runOne(k))U.flash(nm(k)+' imported.');});
})();
