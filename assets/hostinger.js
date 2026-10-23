/* Hostinger MySQL adapter. The browser never receives database credentials. */
(function () {
  'use strict';
  if (window.claude && typeof window.claude.use === 'function') return;
  var base = new URL('api/index.php', document.baseURI), csrf = '', subscriptions = new Set();
  var server = window.UmangServer = { user: null, error: '', blobURL: function (id) { var u = new URL(base); u.searchParams.set('action', 'blob'); u.searchParams.set('id', id); return u.href; } };
  function viewKey() { var p = location.hash.slice(1).split('.'); return p[1] && p[1].indexOf('m-') === 0 ? 'master:' + p[1] : p.join('.'); }
  async function request(action, payload, read) {
    var url = new URL(base); url.searchParams.set('action', action);
    var opts = { credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (read) Object.keys(payload || {}).forEach(function (k) { url.searchParams.set(k, payload[k]); });
    else { opts.method = 'POST'; opts.headers['X-CSRF-Token'] = csrf; if (payload instanceof FormData) opts.body = payload; else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(payload || {}); } }
    var response, data;
    try { response = await fetch(url, opts); data = await response.json(); }
    catch (e) { throw { code: 'unavailable', msg: 'Cannot reach the database service. Check your connection and PHP hosting setup.' }; }
    if (!response.ok || data.error) {
      var error = data.error || { code: 'unavailable', msg: 'Database request failed.' };
      if (response.status === 401 && server.user) { server.user = null; location.reload(); }
      throw error;
    }
    return data;
  }
  server.ready = request('session', {}, true).then(function (s) { csrf = s.csrf; server.user = s.user; return s; }).catch(function (e) { server.error = e.msg || 'Database service unavailable.'; return { user: null }; });
  server.login = async function (username, password, remember) { var s = await request('login', { username: username, password: password, remember: remember }); csrf = s.csrf; server.user = s.user; };
  server.logout = function () { return request('logout', {}); };
  function snap(row) { return { id: row.id, exists: row.exists !== false && row.data != null, data: function () { return row.data || {}; }, metadata: {} }; }
  function refresh(path) { subscriptions.forEach(function (s) { if (s.path === path) s.run(); }); }
  function ref(path, id) {
    var holder = '';
    async function write(action, data) { var result = await request(action, { path: path, id: id, data: data, holder: holder }); refresh(path); return result; }
    return { id: id, get: async function () { return snap(await request('get', { path: path, id: id }, true)); }, set: function (data) { return write('set', data); }, update: function (data) { return write('update', data); }, delete: function () { return write('delete'); }, acquire: function (lease) { holder = lease.holder; return request('acquire', { path: path, id: id, holder: holder }); } };
  }
  var db = {
    doc: function (path) { var at = path.lastIndexOf('/'); return ref(path.slice(0, at), path.slice(at + 1)); },
    collection: function (path) {
      return {
        doc: function (id) { return ref(path, id); },
        add: async function (data) { var id = crypto.randomUUID().replace(/-/g, ''), r = ref(path, id); await r.set(data); return r; },
        onSnapshot: function (next, error) {
          var stopped = false, timer, previous, running = false, queued = false;
          var sub = { path: path, run: async function () {
            if (stopped) return; if (running) { queued = true; return; } running = true;
            try {
              await server.ready;
              if (!server.user) return;
              var result = await request('list', { path: path }, true), encoded = JSON.stringify(result.docs);
              if (!stopped && encoded !== previous) { previous = encoded; var docs = result.docs.map(snap); next({ docs: docs, size: docs.length, empty: !docs.length, metadata: {}, docChanges: function () { return []; } }); }
            } catch (e) { previous = undefined; if (!stopped && error) error(e); }
            finally { running = false; clearTimeout(timer); if (!stopped) { if (queued) { queued = false; sub.run(); } else timer = setTimeout(sub.run, document.hidden ? 30000 : 5000); } }
          } };
          subscriptions.add(sub); sub.run();
          return function () { stopped = true; clearTimeout(timer); subscriptions.delete(sub); };
        }
      };
    }
  };
  var assets = { upload: async function (file) { var data = new FormData(); data.append('file', file); data.append('view', viewKey()); return request('upload', data); } };
  var downloads = { save: async function (o) { var blob = o.data instanceof Blob ? o.data : new Blob([o.data]), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = o.filename || 'download'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 10000); } };
  var user = { isOwner: async function () { await server.ready; return !!(server.user && server.user.owner); }, can: async function () { await server.ready; return !!server.user; }, me: async function () { await server.ready; return server.user; }, profiles: async function (ids) { var result = await request('list', { path: 'masters/users/rows' }, true), out = {}; result.docs.forEach(function (r) { if (ids.indexOf(r.id) !== -1) out[r.id] = { name: r.data.name }; }); return out; }, search: async function (q) { var result = await request('list', { path: 'masters/users/rows' }, true); return result.docs.filter(function (r) { return String(r.data.name).toLowerCase().indexOf(String(q).toLowerCase()) !== -1; }).map(function (r) { return { id: r.id, name: r.data.name }; }); } };
  window.claude = { use: async function (name) { await server.ready; return { db: db, assets: assets, downloads: downloads, user: user }[name] || null; } };
  window.addEventListener('focus', function () { subscriptions.forEach(function (s) { s.run(); }); });
})();
