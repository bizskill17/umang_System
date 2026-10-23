(function(){
  var store={}, listeners={}, n=0;
  function snap(path){ var docs=Object.keys(store[path]||{}).map(function(id){var d=store[path][id];return {id:id,exists:true,data:function(){return d;},metadata:{}};}); return {docs:docs,size:docs.length,empty:!docs.length,docChanges:function(){return [];},metadata:{}}; }
  function fire(path){ (listeners[path]||[]).forEach(function(f){ setTimeout(function(){f(snap(path));},0); }); }
  function split(p){ var i=p.lastIndexOf("/"); return [p.slice(0,i), p.slice(i+1)]; }
  function docRef(coll,id){ return {
    id:id,
    set:function(d){ store[coll]=store[coll]||{}; store[coll][id]=JSON.parse(JSON.stringify(d)); fire(coll); return Promise.resolve(); },
    delete:function(){ if(store[coll]) delete store[coll][id]; fire(coll); return Promise.resolve(); },
    update:function(d){ if(!store[coll]||!store[coll][id]) return Promise.reject({code:"invalid_argument"}); Object.assign(store[coll][id], JSON.parse(JSON.stringify(d))); store[coll][id]=Object.assign({},store[coll][id]); fire(coll); return Promise.resolve(); },
    get:function(){ var d=store[coll]&&store[coll][id]; return Promise.resolve({id:id,exists:!!d,data:function(){return d;}}); },
    acquire:function(){ return Promise.resolve({acquired:true}); }
  };}
  function collRef(path){ return {
    onSnapshot:function(next){ (listeners[path]=listeners[path]||[]).push(next); setTimeout(function(){next(snap(path));},20); return function(){ listeners[path]=listeners[path].filter(function(f){return f!==next;}); }; },
    add:function(d){ var id="id"+(++n); return docRef(path,id).set(d).then(function(){return {id:id};}); },
    doc:function(id){ return docRef(path, id||("id"+(++n))); }
  };}
  window.__store=store;
  var db={collection:collRef, doc:function(p){ var s=split(p); return docRef(s[0],s[1]); }};
  window.claude={use:function(name){ return Promise.resolve(name==="db"?db:name==="assets"?{upload:function(b,o){return Promise.resolve({id:"a"+(++n),url:"/_blob/a"+n,contentType:(o&&o.type)||b.type})}}:name==="downloads"?{save:function(o){window.__saved=o;return Promise.resolve()}}:(name==="user"?{can:function(){return Promise.resolve(true);},isOwner:function(){return Promise.resolve(!window.__mockUser);},profiles:function(ids){var P={u_ravi:"Ravi Kumar",u_sita:"Sita Rao",u1:"Owner"},o={};[].concat(ids).forEach(function(i){o[i]={id:i,name:P[i]||"",avatarUrl:"",color:"#888",email:null,isMe:false,guest:false};});return Promise.resolve(o);},search:function(q){var L=[{id:"u_ravi",name:"Ravi Kumar"},{id:"u_sita",name:"Sita Rao"}];return Promise.resolve(L.filter(function(p){return !q||p.name.toLowerCase().indexOf(q.toLowerCase())!==-1;}).map(function(p){return Object.assign({avatarUrl:"",color:"#888",email:null,isMe:false,guest:false},p);}));},me:function(){var m=window.__mockUser||{isOwner:true,name:"Owner",email:"owner@x.com"};return Promise.resolve({id:m.id||"u1",name:m.name||"",email:m.email||null,isOwner:!!m.isOwner,canEdit:!!m.isOwner,avatarUrl:"",color:"#888"});}}:null)); }};
})();
