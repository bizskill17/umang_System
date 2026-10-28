/* Shared operations: navigation, uploads, reporting and management views. */
(function () {
  'use strict';
  var U = window.U, P = U.P, E = U.esc;
  var active = function (r) { return r.status !== 'Completed' && r.status !== 'Canceled' && r.status !== 'Approved'; };
  var n = function (v) { return Number(v) || 0; };
  var sourceSuccess = function (s) { return s === 'Success' || s === 'Quotation Approved'; };
  U.loading = '<p class="mv-note ops-loading" role="status"><span class="ops-spinner"></span>Loading…</p>';
  var busyCount = 0;
  function busy(on, label) {
    busyCount = Math.max(0, busyCount + (on ? 1 : -1));
    var el = document.getElementById('ops-busy');
    if (!el) { el = document.createElement('div'); el.id = 'ops-busy'; el.setAttribute('role', 'status'); el.innerHTML = '<span class="ops-spinner"></span><span></span>'; document.body.appendChild(el); }
    el.hidden = !busyCount; el.lastElementChild.textContent = label || 'Working…';
  }
  U.busy = busy;
  async function working(fn, label) { busy(true, label); try { return await fn(); } finally { busy(false); } }
  ['add', 'upd', 'del', 'savePdf'].forEach(function (key) { var original = U[key]; U[key] = function () { var args = arguments; return working(function () { return original.apply(U, args); }, key === 'savePdf' ? 'Generating download…' : 'Saving…'); }; });

  // All application uploads use this path, including master logos and screenshots.
  U.optimiseFile = async function (file) {
    if (!file || !file.size) throw U.fail('Choose a non-empty file.');
    if (file.size > 20 * 1024 * 1024) throw U.fail('Files can be up to 20 MB.');
    if (!/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) throw U.fail('Unsupported file type.');
    if (/\.pdf$/i.test(file.name)) {
      try { var original = new Uint8Array(await file.arrayBuffer());
        if (/\/ByteRange/.test(new TextDecoder('latin1').decode(original))) return file;
        var lib=await U.loadPdfLib(), pdfDocument=await lib.PDFDocument.load(original), compact=await pdfDocument.save({useObjectStreams:true});
        if(compact.length<file.size)return new File([compact],file.name,{type:'application/pdf'});
      } catch(error) { /* Encrypted or specialised PDFs retain their original bytes. */ }
      return file;
    }
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) return file;
    var url = URL.createObjectURL(file), im = new Image();
    try {
      await new Promise(function (resolve, reject) { im.onload = resolve; im.onerror = reject; im.src = url; });
      var scale = Math.min(1, 2200 / Math.max(im.width, im.height));
      var canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(im.width * scale)); canvas.height = Math.max(1, Math.round(im.height * scale));
      canvas.getContext('2d').drawImage(im, 0, 0, canvas.width, canvas.height);
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/webp', 0.88); });
      if (blob && blob.size < file.size) return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {type:'image/webp'});
      return file;
    } catch (e) { throw U.fail('This image could not be read. Choose a JPG, PNG or WebP image.'); }
    finally { URL.revokeObjectURL(url); }
  };
  U.imageForPdf = async function(file) {
    var response=await fetch(window.UmangBlobURL(file.id));if(!response.ok)throw U.fail('Cannot read the item photo.');
    var blob=await response.blob(),url=URL.createObjectURL(blob),image=new Image();
    try{await new Promise(function(resolve,reject){image.onload=resolve;image.onerror=reject;image.src=url;});var canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);var png=await new Promise(function(resolve){canvas.toBlob(resolve,'image/png');});return await png.arrayBuffer();}finally{URL.revokeObjectURL(url);}
  };
  var upload = U.upload;
  U.upload = function (file) { return working(async function () { return upload(await U.optimiseFile(file)); }, 'Optimising and uploading…'); };

  function navigation() {
    var bar = document.getElementById('ops-nav');
    if (!bar) { bar = document.createElement('nav'); bar.id = 'ops-nav'; bar.setAttribute('aria-label', 'Departments'); document.querySelector('.crumb-row').before(bar); }
    var auth = window.UmangAuth, current = location.hash.slice(1).split('.')[0];
    var html = Object.keys(window.UmangMenus).filter(function (slug) { return auth && auth.ready && auth.modAllowed(slug); }).map(function (slug, i) {
      return '<a href="#' + slug + '" class="ops-dept ops-c' + i % 8 + '"' + (slug === current ? ' aria-current="page"' : '') + '>' + E(window.UmangMenus[slug].name) + '</a>';
    }).join('');
    if (bar.innerHTML !== html) bar.innerHTML = html;
  }
  window.addEventListener('hashchange', navigation); U.onChange(navigation); navigation();

  // Respect inherited sources on every redraw and in U.read, not just visually.
  var fields = U.fields;
  U.fields = function (fs, v, prefix) {
    var locked = !!(v.source_locked || v._fixedSrc); if(locked && (v.src||'').indexOf('L:')===0){var lead=U.get('leads',v.src.slice(2));if(lead){if(lead.firm_id)v.firm_id=lead.firm_id;if(lead.owner_id)v.sales_person=lead.owner_id;}}
    if (locked) fs = fs.map(function (f) {
      var inherited = f.k === 'src' || ((f.k === 'firm_id' || f.k === 'sales_person') && (v.src || '').indexOf('L:') === 0 && v[f.k]);
      return inherited ? Object.assign({}, f, {readonly:true, hint:'Inherited from the source record.'}) : f;
    });
    return fields(fs, v, prefix);
  };
  var read = U.read;
  U.read = function (form, fs, v) {
    var out = read(form, fs, v);
    if (v.source_locked || v._fixedSrc) ((v.src||'').indexOf('L:')===0?['src', 'firm_id', 'sales_person']:['src']).forEach(function (k) { if (v[k]) out[k] = v[k]; });
    return out;
  };
  var openForm = U.formPage;
  U.formPage = function (key, cfg) {
    if (key === 'projects.add' && P.slug !== 'quotations') P.projectCreateReturn = null;
    return openForm(key, cfg);
  };
  U.page('quotations.create-project', function () {
    if (!P.forms['projects.add'] || !P.forms['projects.add'].v.quotation_id) return '<p class="mv-note">Select a successful quotation from <a href="#quotations.pending-create">Pending Create Project</a>.</p>';
    return P.pages['projects.add']();
  });

  // Quick customer creation is a dialog; the parent form stays mounted with its values.
  function customerAdd(select) {
    if (U.modalOpen()) return;
    if (document.getElementById('u-pform')) U.render();
    U.need(['customer-category','customer-subcategory','city','state'].map(U.m));
    U.modal({title:'Add Customer', fields:[
      {k:'name',label:'Customer Name',type:'text',req:1},
      {k:'category_id',label:'Category',type:'select',req:1,opts:function () {return U.mact('customer-category');}},
      {k:'subcategory_id',label:'Subcategory',type:'select',req:1,opts:function () {return U.mact('customer-subcategory');}},
      {k:'state_id',label:'State',type:'select',req:1,live:1,opts:function () {return U.mact('state');}},
      {k:'city_id',label:'City',type:'select',req:1,opts:function(v) {return U.mact('city').filter(function(c){return c.state_id === v.state_id;});}},
      {k:'mobile',label:'Mobile',type:'text',req:1},{k:'address',label:'Address',type:'textarea'}
    ], validate:function(v) {if (!/^\d{10}$/.test(v.mobile)) return 'Enter a 10-digit mobile number.';}, save:async function(v) {
      v.subcategory_ids = [v.subcategory_id]; delete v.subcategory_id; v.status = 'Active';
      var added = await U.add(U.m('customers'),v);
      // Update local lookup immediately; the server snapshot subsequently replaces it.
      U.data[U.m('customers')] = U.mrows('customers').concat([Object.assign({id:added.id},v)]);
      var target = document.getElementById(select.id);
      if (target) { var option = new Option(v.name,added.id,true,true); target.add(option); target.value = added.id; target.dispatchEvent(new Event('change',{bubbles:true})); }
      return 'Customer created and selected.';
    }});
  }

  // Real .xlsx files: minimal OOXML packaged in a stored ZIP, without external dependencies.
  var encoder = new TextEncoder(), crcTable;
  function crc(bytes) { if (!crcTable) crcTable = Array.from({length:256},function(_,i){for(var j=0;j<8;j++) i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0;}); var c=0xffffffff; bytes.forEach(function(b){c=crcTable[(c^b)&255]^(c>>>8);});return (c^0xffffffff)>>>0; }
  function zip(files) {
    var parts=[], directory=[], offset=0;
    Object.keys(files).forEach(function(name){var nm=encoder.encode(name), data=encoder.encode(files[name]), c=crc(data), h=new Uint8Array(30+nm.length), v=new DataView(h.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,c,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,nm.length,true);h.set(nm,30);parts.push(h,data);
      var d=new Uint8Array(46+nm.length), w=new DataView(d.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint32(16,c,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,nm.length,true);w.setUint32(42,offset,true);d.set(nm,46);directory.push(d);offset+=h.length+data.length;
    });
    var size=directory.reduce(function(t,d){return t+d.length;},0), end=new Uint8Array(22), e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,directory.length,true);e.setUint16(10,directory.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);return new Blob(parts.concat(directory,[end]),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function xml(s) {return String(s == null?'':s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c];});}
  function column(i) {var s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;}
  U.xlsx = function (rows) {
    var ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    var sheet='<worksheet xmlns="'+ns+'"><sheetData>'+rows.map(function(row,r){return '<row r="'+(r+1)+'">'+row.map(function(val,c){var ref=column(c)+(r+1);return typeof val==='number'&&isFinite(val)?'<c r="'+ref+'"><v>'+val+'</v></c>':'<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+xml(val)+'</t></is></c>';}).join('')+'</row>';}).join('')+'</sheetData></worksheet>';
    return zip({'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':'<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>', 'xl/worksheets/sheet1.xml':sheet});
  };
  U.saveBlob = async function(blob,name) { if(U.downloads) return U.downloads.save({filename:name,data:blob});var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(url);},4000); };
  function plain(html) {var div=document.createElement('div');div.innerHTML=String(html==null?'':html);div.querySelectorAll('input,select,svg').forEach(function(x){x.remove();});return div.textContent.trim();}
  function cellValue(value) {if(typeof value==='number')return value;var text=plain(value), ungroup=text.replace(/^₹\s*/,'').replace(/,/g,'');return /^-?\d+(\.\d+)?$/.test(ungroup)&&!/^0\d/.test(ungroup)?Number(ungroup):text;}
  var table=U.table, exports=new Map(), exportSeq=0;
  U.table=function(cols,rows,rowCls,empty,allRows){
    var h=table(cols,rows,rowCls,empty), id=String(++exportSeq), filtered=U.onlyRows(allRows||rows);
    var keep=cols.map(function(c,i){return /action/i.test(plain(c[0]))||c[2]==='act'? -1:i;}).filter(function(i){return i>=0;});
    exports.set(id,{cols:cols,rows:filtered,keep:keep});if(exports.size>120)exports.delete(exports.keys().next().value);
    return '<div class="ops-table" data-export="'+id+'"><button type="button" class="mv-btn ghost sm ops-excel" data-ops="excel">Download Excel</button>'+h+'</div>';
  };
  async function exportTable(button) {
    var owner=button.closest('[data-export]'), snapshot=owner&&exports.get(owner.dataset.export), rows;
    if(snapshot)rows=[snapshot.keep.map(function(i){return plain(snapshot.cols[i][0]);})].concat(snapshot.rows.map(function(r,index){return snapshot.keep.map(function(i){return cellValue(snapshot.cols[i][1](r,index));});}));
    else {var wrap=button.parentElement,t=wrap.querySelector('table'),header=t.tHead&&t.tHead.rows[0],omit=[];if(header)Array.from(header.cells).forEach(function(c,i){if(/^actions?$/i.test(c.textContent.trim())||c.classList.contains('act'))omit.push(i);});rows=Array.from(t.rows).map(function(r){return Array.from(r.cells).filter(function(c,i){return omit.indexOf(i)<0&&!c.classList.contains('act');}).map(function(c){return cellValue(c.innerHTML);});});}
    await U.saveBlob(U.xlsx(rows),(location.hash.slice(1)||'report').replace(/[^\w.-]/g,'-')+'.xlsx');
  }

  // Read-only detail and sheet PDFs use the existing PDF layout helper.
  function pdfButton(kind,id,label){return '<button type="button" class="mv-btn ghost sm" data-ops="'+kind+'" data-id="'+E(id)+'">'+label+'</button>';}
  function pair(c,label,value) {if(value!==''&&value!=null)c.para(label+': '+value,c.M,c.W-2*c.M,{size:9});}
  function heading(c,text){c.need(35);c.y-=10;c.para(text,c.M,c.W-2*c.M,{bold:true,size:12});c.y-=4;}
  U.related = function (coll,p) {return U.rows(coll).filter(function(r){return r.project_id===p.id||(p.lead_id&&r.lead_id===p.lead_id)||(coll==='quotations'&&r.id===p.quotation_id);});};
  async function projectPdf(id,sheetOnly) {
    var p=U.get('projects',id);if(!p)return;
    var bytes=await U.makePdf(function(c){
      heading(c,sheetOnly?'Project Sheet':'Project Details');
      [['Project',p.no],['Customer',U.nm('customers',p.customer_id)],['Firm',U.nm('firm',p.firm_id)],['Date',U.dmy(p.date)],['Target',U.dmy(p.due)],['Status',p.status],['Lead',U.leadNo(p.lead_id)],['Owner',U.user(p.owner)],['Controller',U.user(p.controller)]].forEach(function(x){pair(c,x[0],x[1]);});
      heading(c,'Project Sheet');
      var labels={billing_name:'Billing Name',outsource:'Outsource Applicable',outsource_to:'Outsource To',outsource_job:'Outsourced Job Type',recce:'Recce',job_type:'Job Type',delivery_head:'Delivery Head',installation:'Installation',install_cert:'Installation Certificate',billing_type:'Billing Type',material:'Material Details',vendor_id:'Vendor',notes:'Additional Notes',sheet_status:'Sheet Status'};
      Object.keys(labels).forEach(function(k){pair(c,labels[k],p[k]);});
      (p.sheet_documents||[]).forEach(function(f){pair(c,'Attachment',f.name);});
      if(sheetOnly)return;
      ['designs','recce','quotations'].forEach(function(coll){var rs=U.related(coll,p);if(!rs.length)return;heading(c,'Related '+coll);c.table([['No.',120],['Date',85],['Status',170],['Value / Units',140]],rs.map(function(r){return[r.no||'',U.dmy(r.date),r.status||'',coll==='quotations'?U.num(r.total):U.num(r.count||r.units)];}));});
      var jobs=U.rows('jobs').filter(function(j){return j.project_id===id;});
      if(jobs.length){heading(c,'Jobs');c.table([['Job',110],['Date',85],['Target',85],['Status',120],['Items',115]],jobs.map(function(j){return[j.no,U.dmy(j.date),U.dmy(j.target),j.status,(j.items||[]).length];}));}
      var ds=U.rows('dispatches').filter(function(d){return d.project_id===id;});if(ds.length){heading(c,'Delivery History');c.table([['Dispatch',160],['Date',90],['Quantity',100],['Remarks',165]],ds.map(function(d){return[d.no,U.dmy(d.date),(d.items||[]).reduce(function(t,i){return t+n(i.qty);},0),d.remarks||''];}));}
    });await U.savePdf(bytes,(sheetOnly?'Project-Sheet-':'Project-')+p.no.replace(/[\/\\]/g,'-')+'.pdf');
  }
  async function jobPdf(id) {var j=U.get('jobs',id);if(!j)return;var p=U.get('projects',j.project_id)||{};
    var bytes=await U.makePdf(function(c){heading(c,'Job '+j.no);[['Project',p.no],['Customer',U.nm('customers',j.customer_id||p.customer_id)],['Date',U.dmy(j.date)],['Target',U.dmy(j.target)],['Status',j.status],['Remarks',j.remarks]].forEach(function(x){pair(c,x[0],x[1]);});
      (j.items||[]).forEach(function(it,i){heading(c,'Item '+(i+1)+' - '+(U.nm('items',it.item_id)||''));pair(c,'Description',it.description);pair(c,'Quantity',U.num(it.qty)+' '+(it.uom||''));pair(c,'Dimensions',[it.width,it.height].filter(Boolean).join(' x '));pair(c,'Stages',(it.steps||[]).join(', '));
        U.rows('job_assign').filter(function(a){return a.job_id===id&&a.lid===it.lid;}).forEach(function(a){pair(c,a.stage,U.num(a.completed)+' / '+U.num(a.qty)+'; '+(U.nm('vendors',a.vendor_id)||U.nm('machines',a.machine_id))+'; '+U.dmy(a.date));});
        var qc=U.rows('qc').filter(function(q){return q.job_id===id&&q.lid===it.lid;});pair(c,'QC passed',U.num(qc.reduce(function(t,q){return t+n(q.passed);},0)));
      });});await U.savePdf(bytes,'Job-'+j.no.replace(/[\/\\]/g,'-')+'.pdf');}

  U.page('projects.pending-delivery',function(){
    if(!U.base(['jobs','qc','dispatches',U.m('items')]))return U.loading;
    var st=U.st(), rows=U.PJ.jobItemsFlat(function(r){return r.p.status!=='Canceled'&&r.p.status!=='Completed';}).map(function(r){var done=U.rows('qc').filter(function(q){return q.job_id===r.j.id&&q.lid===r.it.lid;}).reduce(function(t,q){return t+n(q.passed);},0),sent=0;U.rows('dispatches').forEach(function(d){(d.items||[]).forEach(function(i){if(i.job_id===r.j.id&&i.lid===r.it.lid)sent+=n(i.qty);});});return Object.assign(r,{passed:done,delivered:sent,pending:Math.max(0,done-sent)});}).filter(function(r){return r.pending>0&&U.match(st,[r.p.no,r.j.no,U.nm('customers',r.p.customer_id),r.it.description].join(' '),r.p.date);});
    return U.bar(st,[],true)+U.table([['Project',function(r){return E(r.p.no);}],['Job',function(r){return E(r.j.no);}],['Customer',function(r){return E(U.nm('customers',r.p.customer_id));}],['Item',function(r){return E(U.nm('items',r.it.item_id)+' '+(r.it.description||''));}],['QC Passed',function(r){return r.passed;}],['Delivered',function(r){return r.delivered;}],['Pending Delivery',function(r){return r.pending;}],['Action',function(r){return U.btn('p-deliver',r.p.id,'Create Delivery',true);},'act']],rows,null,'No QC-passed items awaiting delivery.')+U.count(rows.length,'item');
  });

  function outsourceRows(){
    var list=[];
    ['recce','designs'].forEach(function(coll){U.rows(coll).filter(function(r){return r.vendor_id;}).forEach(function(r){list.push({id:coll+':'+r.id,source:coll==='recce'?'Recce':'Design',no:r.no,customer_id:r.customer_id,project_id:r.project_id,vendor:r.vendor_id,date:r.date,due:r.target||r.due,status:r.status,owner:r.assigned_to||r.designer,remarks:r.remarks,route:coll==='recce'?'recce.master':'design.master'});});});
    U.rows('job_assign').filter(function(a){return a.vendor_id;}).forEach(function(a){var j=U.get('jobs',a.job_id)||{},p=U.get('projects',j.project_id)||{};list.push({id:'assignment:'+a.id,source:a.stage,no:j.no,customer_id:p.customer_id,project_id:p.id,vendor:a.vendor_id,date:a.date,due:a.target||j.target,status:a.closed||n(a.completed)>=n(a.qty)?'Completed':'In Progress',owner:a.assignee,remarks:U.num(a.completed)+' / '+U.num(a.qty),route:'projects.'+(a.stage||'').toLowerCase()+'-master'});});
    U.rows('projects').filter(function(p){return /^yes$/i.test(p.outsource||'')||p.outsource_to;}).forEach(function(p){list.push({id:'project:'+p.id,source:'Project',no:p.no,customer_id:p.customer_id,project_id:p.id,vendor:p.outsource_to||p.vendor_id,date:p.date,due:p.due,status:p.status,owner:p.controller,remarks:p.outsource_job,route:'projects.master'});});
    U.rows('dispatches').filter(function(d){return d.mode_type==='Outsource';}).forEach(function(d){list.push({id:'delivery:'+d.id,source:'Delivery',no:d.no,customer_id:d.customer_id,project_id:d.project_id,vendor:d.party,date:d.date,due:d.date,status:'Completed',owner:d.delivered_by,remarks:d.remarks,route:'projects.delivered'});});return list;
  }
  U.outsourceRows = outsourceRows;
  ['all','pending','completed'].forEach(function(view){U.page('outsource.'+view,function(){if(!U.base(['recce','designs','projects','job_assign','jobs','dispatches']))return U.loading;var st=U.st(),rows=outsourceRows().filter(function(r){return(view==='all'||(view==='pending'?active(r):r.status==='Completed'))&&(!st.vendor||r.vendor===st.vendor)&&(!st.department||r.source===st.department)&&U.match(st,[r.source,r.no,r.remarks,U.nm('vendors',r.vendor),U.nm('customers',r.customer_id)].join(' '),r.date);});return U.bar(st,[{k:'vendor',label:'Vendor',first:'All vendors',opts:U.mact('vendors')},{k:'department',label:'Department',first:'All departments',opts:['Recce','Design','Printing','Laser','Fabrication','Cutting','Project','Delivery'].map(function(x){return{id:x,name:x};})}],true)+U.table([['Department',function(r){return E(r.source);}],['Reference',function(r){return '<a href="#'+r.route+'">'+E(r.no)+'</a>';}],['Project',function(r){return E(U.projNo(r.project_id));}],['Customer',function(r){return E(U.nm('customers',r.customer_id));}],['Vendor',function(r){return E(U.nm('vendors',r.vendor)||r.vendor);}],['Assigned',function(r){return U.dmy(r.date);}],['Due',function(r){return U.dmy(r.due);}],['Status',function(r){return U.pill(r.status);}],['Overdue Days',function(r){return active(r)?daysLate(r.due):0;}],['Responsible',function(r){return E(U.user(r.owner));}],['Details',function(r){return E(r.remarks);}]],rows)+U.count(rows.length,'task');});});

  function daysLate(date){if(!date||date>=U.today())return 0;return Math.max(0,Math.floor((Date.parse(U.today()+'T00:00:00Z')-Date.parse(date.slice(0,10)+'T00:00:00Z'))/86400000));}
  U.opsLate=daysLate;
  // Dashboards share filters, actionable records, ageing and workload summaries.
  var dashboardConfig={leads:{coll:'leads',owner:'owner_id',due:function(r){return(r.last_fu||{}).next_date||r.date;},route:'master'},recce:{coll:'recce',owner:'assigned_to',due:function(r){return r.target;},route:'master'},design:{coll:'designs',owner:'designer',due:function(r){return r.due;},route:'master'},quotations:{coll:'quotations',owner:'sales_person',due:function(r){return r.next_fu||r.expiry||r.assigned_date;},route:'master'},projects:{coll:'projects',owner:'owner',due:function(r){return r.due;},route:'master'}};
  Object.keys(dashboardConfig).forEach(function(slug){U.page(slug+'.dashboard',function(){
    var cfg=dashboardConfig[slug];if(!U.base(['leads','recce','designs','quotations','projects','jobs','job_assign','qc','dispatches',U.m('lead-sources')]))return U.loading;
    var st=U.st(),all=U.rows(cfg.coll).filter(function(r){return(!st.who||r[cfg.owner]===st.who||r.assigned_to===st.who||r.controller===st.who)&&(!st.status||r.status===st.status)&&U.match(st,[r.no,r.lead_no,U.nm('customers',r.customer_id),r.remarks].join(' '),r.date||r.assigned_date||(r.createdAt||'').slice(0,10));}),open=all.filter(active),late=open.filter(function(r){return daysLate(cfg.due(r))>0;}),tiles=[['Total Records',all.length,cfg.route,all],['Open',open.length,cfg.route,open],['Overdue',late.length,cfg.route,late],['Completed / Successful',all.filter(function(r){return r.status==='Completed'||r.status==='Approved';}).length,cfg.route,all.filter(function(r){return r.status==='Completed'||r.status==='Approved';})]];
    if(slug==='projects'){var noJobs=open.filter(function(p){return!U.rows('jobs').some(function(j){return j.project_id===p.id;});});tiles.push(['Pending Job Creation',noJobs.length,'pending-jobs',noJobs],['Projects In Progress',open.length-noJobs.length,'in-progress'],['Pending Create Project',U.PJ.approvedFree().length,'pending-create']);}
    if(slug==='projects'){
      var ids=new Set(all.map(function(p){return p.id;})),jobs=U.rows('jobs').filter(function(j){return ids.has(j.project_id)&&j.status!=='Canceled';}),ready=0;
      jobs.forEach(function(j){(j.items||[]).forEach(function(it){var passed=U.rows('qc').filter(function(q){return q.job_id===j.id&&q.lid===it.lid;}).reduce(function(t,q){return t+n(q.passed);},0),sent=0;U.rows('dispatches').forEach(function(d){(d.items||[]).forEach(function(i){if(i.job_id===j.id&&i.lid===it.lid)sent+=n(i.qty);});});if(passed>sent)ready++;});});
      tiles.push(['Jobs in Progress',jobs.filter(active).length,'jobs-in-progress'],['Pending Delivery Items',ready,'pending-delivery'],['Quality Check Due',U.PJ.jobItemsFlat(function(r){return ids.has(r.p.id)&&r.j.status!=='Completed'&&U.PJ.qcDue(r.j,r.it)>0;}).length,'quality-check-due']);
    }
    if(slug==='quotations'){var pending=all.filter(function(q){return U.PJ.approvedFree().some(function(x){return x.id===q.id;});}),approved=all.filter(function(q){return q.status==='Approved';});tiles.push(['Pending Create Project',pending.length,'pending-create',pending],['Pipeline Value',U.inr(open.reduce(function(t,q){return t+n(q.total);},0))||'₹0','master',open],['Success Rate',all.length?Math.round(approved.length/all.length*100)+'%':'0%','master',approved]);}
    if(slug==='leads'){var quotes=U.rows('quotations'),converted=all.filter(function(l){return quotes.some(function(q){return q.lead_id===l.id&&q.status==='Approved';});}),unassigned=open.filter(function(l){return!l.assigned_to;});tiles.push(['Unassigned',unassigned.length,'pending-assignee',unassigned],['Conversion Rate',all.length?Math.round(converted.length/all.length*100)+'%':'0%','master',converted],['No Follow-up Recorded',open.filter(function(l){return!l.last_fu;}).length,'master',open.filter(function(l){return!l.last_fu;})]);}
    if(slug==='recce')tiles.push(['Pending PPT',all.filter(function(r){return r.ppt_by&&!r.ppt;}).length,'pending-ppt']);
    if(slug==='design')tiles.push(['Pending Approval',all.filter(function(d){return d.approval_required&&n((d.done||{}).completed)>n((d.done||{}).approved);}).length,'client-approval']);
    var statusOpts=Array.from(new Set(U.rows(cfg.coll).map(function(r){return r.status;}).filter(Boolean))).sort().map(function(x){return{id:x,name:x};});
    var html=U.bar(st,[{k:'who',label:'Employee',first:'All employees',opts:U.mact('users')},{k:'status',label:'Status',first:'All statuses',opts:statusOpts}],true)+'<p class="mf-hint">Date filters use record creation dates. Overdue uses the next follow-up or target date. Click a figure to inspect its records.</p>'+U.kpis(slug,tiles);
    var stages={};all.forEach(function(r){var key=r.status||'Unspecified',group=stages[key]||(stages[key]={status:key,count:0,value:0,units:0});group.count++;group.value+=n(r.total||r.estimate);group.units+=n(r.count||r.units);});
    html+='<section class="ld-card"><h3>Pipeline by Stage</h3>'+U.table([['Stage',function(r){return E(r.status);}],['Records',function(r){return r.count;}],[slug==='leads'?'Estimate Value':slug==='quotations'?'Quotation Value':'Designs / Sites',function(r){return slug==='leads'||slug==='quotations'?r.value:r.units;}]],Object.values(stages))+'</section>';
    var age=[0,0,0,0];open.forEach(function(r){var d=daysLate(cfg.due(r));if(d)age[d<=7?0:d<=15?1:d<=30?2:3]++;});
    html+='<section class="ld-card"><h3>Overdue Ageing</h3>'+U.table([['1–7 Days',function(){return age[0];}],['8–15 Days',function(){return age[1];}],['16–30 Days',function(){return age[2];}],['Over 30 Days',function(){return age[3];}]],[{}])+'</section>';
    var workload={};all.forEach(function(r){var id=r[cfg.owner]||r.assigned_to||'unassigned',w=workload[id]||(workload[id]={id:id,total:0,open:0,overdue:0});w.total++;if(active(r))w.open++;if(active(r)&&daysLate(cfg.due(r)))w.overdue++;});
    html+='<section class="ld-card"><h3>Team Workload</h3>'+U.table([['Employee',function(w){return E(U.user(w.id)||'Unassigned');}],['Total',function(w){return w.total;}],['Open',function(w){return w.open;}],['Overdue',function(w){return w.overdue;}]],Object.values(workload))+'</section>';
    if(slug==='leads'){var sources={};all.forEach(function(l){var id=l.lead_source_id||'',s=sources[id]||(sources[id]={id:id,count:0,won:0});s.count++;if(U.rows('quotations').some(function(q){return q.lead_id===l.id&&q.status==='Approved';}))s.won++;});html+='<section class="ld-card"><h3>Lead Sources</h3>'+U.table([['Source',function(s){return E(U.nm('lead-sources',s.id)||'Unspecified');}],['Leads',function(s){return s.count;}],['Converted',function(s){return s.won;}]],Object.values(sources))+'</section>';}
    var priorities=open.slice().sort(function(a,b){return daysLate(cfg.due(b))-daysLate(cfg.due(a));});
    html+='<section class="ld-card"><h3>Open Work — Oldest Overdue First</h3>'+U.table([['Reference',function(r){return E(r.no||r.lead_no||'Awaiting number');}],['Customer',function(r){return E(U.nm('customers',r.customer_id));}],['Status',function(r){return U.pill(r.status);}],['Responsible',function(r){return E(U.user(r[cfg.owner]||r.assigned_to));}],['Due',function(r){return U.dmy(cfg.due(r));}],['Overdue Days',function(r){return daysLate(cfg.due(r));}],['Action',function(r){if(slug==='projects')return U.btn('p-view',r.id,'View');if(slug==='quotations')return U.btn('q-view',r.id,'View');if(slug==='design')return U.btn('design-history',r.id,'View');if(slug==='recce')return U.btn('recce-history',r.id,'View');return '<a href="#leads.master">Open Leads</a>';},'act']],priorities,null,'No open work for these filters.')+'</section>';return html;
  });});
  // The original Leads renderer owns its dashboard route. Yield that route to shared pages.
  (window.UmangPages||[]).forEach(function(handler){var has=handler.has;if(has('leads','dashboard')&&!has('design','dashboard'))handler.has=function(slug,key){return slug==='leads'&&key==='dashboard'?false:has(slug,key);};});

  // Add UI controls to legacy tables and dialogs, which predate U.table.
  var queued=false;
  function enhance(){queued=false;navigation();
    document.querySelectorAll('.mv-table-wrap').forEach(function(w){if(w.dataset.mobileScroll)return;w.dataset.mobileScroll='1';w.setAttribute('tabindex','0');w.setAttribute('role','region');w.setAttribute('aria-label','Scrollable data table');var hint=document.createElement('p');hint.className='mobile-table-hint';hint.textContent='Swipe the table sideways to view all columns.';w.before(hint);});
    document.querySelectorAll('table.mv-table').forEach(function(t){if(t.closest('#qi-wrap')||t.closest('#u-pform')||t.closest('[data-export]')||t.dataset.opsExport)return;t.dataset.opsExport='1';var b=document.createElement('button');b.type='button';b.className='mv-btn ghost sm ops-excel';b.dataset.ops='excel';b.textContent='Download Excel';t.parentElement.prepend(b);});
    document.querySelectorAll('select').forEach(function(sel){if(sel.closest('#u-modal')||sel.disabled||!(/customer_id$/.test(sel.name||sel.id)||/cust|customer/.test(sel.name||sel.dataset.uf||sel.id)&&Array.from(sel.options).some(function(o){return U.mrows('customers').some(function(c){return c.id===o.value;});})))return;if(sel.dataset.opsPlus)return;sel.dataset.opsPlus='1';var parent=sel,ss=sel._ssBtn,wrap=document.createElement('div');wrap.className='sel-add';parent.before(wrap);wrap.append(parent);if(ss)wrap.append(ss);var b=document.createElement('button');b.type='button';b.className='sel-plus';b.textContent='+';b.title='Add Customer';b.setAttribute('aria-label','Add Customer');b.dataset.ops='customer';b.dataset.select=sel.id;wrap.append(b);});
    document.querySelectorAll('[data-a="p-view"]').forEach(function(b){if(b.closest('#u-modal')||b.parentElement.querySelector('[data-ops="project-sheet"]'))return;b.after(makeButton('project-sheet',b.dataset.id,'Sheet PDF'));});
    document.querySelectorAll('[data-a="j-view"]').forEach(function(b){if(b.parentElement.querySelector('[data-ops="job-pdf"]'))return;b.after(makeButton('job-pdf',b.dataset.id,'Job PDF'));});
    var modal=document.querySelector('#u-modal .pd-acts');if(modal&&!modal.querySelector('[data-ops="project-pdf"]')){var st=modal.querySelector('[data-a^="p-"]'),ref=modal.closest('#u-modal').dataset.projectId||(st&&st.dataset.id);if(ref){modal.insertAdjacentHTML('beforeend',pdfButton('project-pdf',ref,'Project Details PDF')+pdfButton('project-sheet',ref,'Project Sheet PDF'));var p=U.get('projects',ref);if(p){var rel='<section class="ld-card"><h3>Related Designs, Recce and Quotations</h3>';['designs','recce','quotations'].forEach(function(coll){rel+=U.table([['Type',function(){return coll==='designs'?'Design':coll==='recce'?'Recce':'Quotation';}],['Reference',function(r){return E(r.no);}],['Status',function(r){return U.pill(r.status);}],['Documents',function(r){return U.fileLinks([r.doc,r.ppt].filter(Boolean));}],['Action',function(r){return U.btn(coll==='designs'?'design-history':coll==='recce'?'recce-history':'q-view',r.id,'View');},'act']],U.related(coll,p));});rel+='</section>';modal.closest('.fu-card').querySelector('#u-mform').before(document.createRange().createContextualFragment(rel));}}}
    document.querySelectorAll('button:disabled').forEach(function(b){if(/Saving|Making PDF|Uploading|Loading/.test(b.textContent)&&!b.querySelector('.ops-spinner'))b.insertAdjacentHTML('afterbegin','<span class="ops-spinner"></span>');});
    document.querySelectorAll('p.mv-note,p.mf-hint').forEach(function(p){if(/^Loading/.test(p.textContent.trim())&&!p.querySelector('.ops-spinner'))p.insertAdjacentHTML('afterbegin','<span class="ops-spinner"></span>');});
  }
  function makeButton(kind,id,label){var d=document.createElement('span');d.innerHTML=pdfButton(kind,id,label);return d.firstElementChild;}
  new MutationObserver(function(){if(!queued){queued=true;requestAnimationFrame(enhance);}}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',function(e){var action=e.target.closest('#u-modal [data-a]');if(action&&action.dataset.a.indexOf('p-')!==0&&P.acts[action.dataset.a]){P.acts[action.dataset.a](action.dataset.id,action);return;}var b=e.target.closest('[data-ops]');if(!b)return;e.preventDefault();var act=b.dataset.ops;if(act==='customer'){customerAdd(document.getElementById(b.dataset.select));return;}working(async function(){b.disabled=true;try{if(act==='excel')await exportTable(b);if(act==='project-sheet'||act==='project-pdf')await projectPdf(b.dataset.id,act==='project-sheet');if(act==='job-pdf')await jobPdf(b.dataset.id);}catch(error){U.flash(U.err(error));}finally{b.disabled=false;}},act==='excel'?'Preparing Excel…':'Preparing PDF…');});
  U.onChange(function(){if(!queued){queued=true;requestAnimationFrame(enhance);}});enhance();
})();
