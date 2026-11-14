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
    var t0 = performance.now(), text = '';
    try { response = await fetch(url, opts); text = await response.text(); data = JSON.parse(text); }
    catch (e) { throw { code: 'unavailable', msg: 'Cannot reach the database service. Check your connection and PHP hosting setup.' }; }
    if (!response.ok || data.error) {
      var error = data.error || { code: 'unavailable', msg: 'Database request failed.' };
      if (response.status === 401 && server.user) { server.user = null; location.reload(); }
      throw error;
    }
    if (action === 'batch') speed.last = { ms: Math.round(performance.now() - t0), srv: +(response.headers.get('X-Umang-Ms') || 0), kb: Math.round(text.length / 1024) };
    return data;
  }
  /* Speed Check page: what each refresh cost on this device (kept in memory only). */
  var speed = window.UmangSpeed = { sync: [], paint: [], cacheMs: null, cacheRows: 0, last: null,
    add: function (list, rec) { list.unshift(rec); if (list.length > 40) list.length = 40; } };
  server.ready = request('session', {}, true).then(function (s) { csrf = s.csrf; server.user = s.user; return s; }).catch(function (e) { server.error = e.msg || 'Database service unavailable.'; return { user: null }; });
  server.login = async function (username, password, remember) { var s = await request('login', { username: username, password: password, remember: remember }); csrf = s.csrf; server.user = s.user; };
  server.logout = async function () { cache = {}; await store.clear(); return request('logout', {}); };
  function snap(row) { return { id: row.id, exists: row.exists !== false && row.data != null, data: function () { return row.data || {}; }, metadata: {} }; }
  /* All open lists refresh together in ONE request (one MySQL connection), at most once a minute while
     the tab is visible, never while it is hidden, and straight away after a save, on focus or a screen change.
     Shared hosting caps MySQL connections per hour, so this keeps usage low. */
  var POLL_MS = 60000, pollTimer = null, polling = false, pollAgain = false;
  var cache = {};  // path -> { v: token from the server, rows } — also kept on this device (see store)
  /* Lists are kept in this browser's IndexedDB, per signed-in user, so opening the app shows the last data
     straight away and only the records that changed since are downloaded. Cleared on sign-out. */
  var store = (function () {
    var dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (res) {
        try { var rq = indexedDB.open('umang-cache', 1); rq.onupgradeneeded = function () { rq.result.createObjectStore('lists'); }; rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { res(null); }; rq.onblocked = function () { res(null); }; }
        catch (e) { res(null); }
      });
      return dbp;
    }
    function key(p) { return (server.user && (server.user.id || server.user.username) || '') + '|' + p; }
    return {
      get: async function (p) { var d = await open(); if (!d) return null; return new Promise(function (res) { try { var rq = d.transaction('lists').objectStore('lists').get(key(p)); rq.onsuccess = function () { res(rq.result || null); }; rq.onerror = function () { res(null); }; } catch (e) { res(null); } }); },
      put: async function (p, val) { var d = await open(); if (!d) return; try { d.transaction('lists', 'readwrite').objectStore('lists').put(val, key(p)); } catch (e) {} },
      clear: async function () { var d = await open(); if (!d) return; await new Promise(function (res) { try { var t = d.transaction('lists', 'readwrite'); t.objectStore('lists').clear(); t.oncomplete = res; t.onerror = res; } catch (e) { res(); } }); }
    };
  })();
  var saveTimers = {};
  function persist(p) { clearTimeout(saveTimers[p]); saveTimers[p] = setTimeout(function () { var c = cache[p]; if (c) store.put(p, { v: c.v, rows: c.rows }); }, 1500); }
  function merge(rows, d) {
    var at = new Map(); rows.forEach(function (r, i) { at.set(r.id, i); });
    var out = rows.slice(), drop = new Set(d.del || []), same = true;
    (d.rows || []).forEach(function (r) { var i = at.get(r.id); if (i === undefined) { out.push(r); same = false; } else if (JSON.stringify(out[i].data) !== JSON.stringify(r.data)) { out[i] = r; same = false; } });
    if (drop.size) { var n = out.length; out = out.filter(function (r) { return !drop.has(r.id); }); if (out.length !== n) same = false; }
    return same ? null : out;
  }
  function schedule(ms) {
    clearTimeout(pollTimer); pollTimer = null;
    if (!subscriptions.size) return;
    if (document.hidden && ms >= POLL_MS) return;
    pollTimer = setTimeout(pollNow, ms);
  }
  async function pollNow() {
    clearTimeout(pollTimer); pollTimer = null;
    if (polling) { pollAgain = true; return; }
    polling = true;
    var subs = Array.from(subscriptions), paths = Array.from(new Set(subs.map(function (s) { return s.path; })));
    try {
      await server.ready;
      if (server.user && paths.length) {
        // Lists saved on this device are shown at once, then brought up to date below.
        var fresh = paths.filter(function (p) { return !cache[p]; });
        if (fresh.length) {
          var tc = performance.now();
          var saved = await Promise.all(fresh.map(function (p) { return store.get(p); }));
          saved.forEach(function (x) { if (x && x.rows) speed.cacheRows += x.rows.length; }); speed.cacheMs = (speed.cacheMs || 0) + Math.round(performance.now() - tc);
          fresh.forEach(function (p, i) { if (saved[i] && Array.isArray(saved[i].rows)) cache[p] = { v: saved[i].v || '', rows: saved[i].rows }; });
          subs.forEach(function (s) { if (subscriptions.has(s) && !s.got && cache[s.path]) { s.got = true; s.deliver(cache[s.path].rows); } });
        }
        var vers = paths.map(function (p) { return cache[p] ? cache[p].v : ''; });
        var result = await request('batch', { paths: paths.join(','), vers: vers.join(',') }, true);
        var lists = result.lists || {}, delta = result.delta || {}, sv = result.vers || {}, changed = {};
        paths.forEach(function (p) {
          var has = Object.prototype.hasOwnProperty;
          if (has.call(lists, p)) { cache[p] = { v: sv[p] || '', rows: lists[p] || [] }; changed[p] = true; }
          else if (has.call(delta, p) && cache[p]) { var m = merge(cache[p].rows, delta[p]); cache[p] = { v: sv[p] || '', rows: m || cache[p].rows }; if (m) changed[p] = true; }
          else if (cache[p]) cache[p].v = sv[p] || '';
          else cache[p] = { v: '', rows: [] };
          if (changed[p]) persist(p);
        });
        var td = performance.now();
        subs.forEach(function (s) { if (subscriptions.has(s) && cache[s.path] && (changed[s.path] || !s.got)) { s.got = true; s.deliver(cache[s.path].rows); } });
        var L = speed.last || {}, fl = Object.keys(lists), dl = Object.keys(delta);
        speed.add(speed.sync, { at: new Date(), lists: paths.length, ms: L.ms, srv: L.srv, kb: L.kb, show: Math.round(performance.now() - td),
          full: fl.map(function (p) { return p.replace('masters/', '').replace('/rows', '') + ' ' + (lists[p] || []).length; }),
          changed: dl.reduce(function (n, p) { return n + (delta[p].rows || []).length + (delta[p].del || []).length; }, 0) });
      }
    } catch (e) { subs.forEach(function (s) { if (subscriptions.has(s)) s.fail(e); }); }
    finally { polling = false; if (pollAgain) { pollAgain = false; schedule(50); } else schedule(POLL_MS); }
  }
  server.msg = function(payload) { return request('msg', payload); };
  server.migrate = async function(payload) { var r = await request('migrate', payload); if (payload && payload.cmd === 'import') schedule(0); return r; };
  server.ims = async function(payload) { var r = await request('ims', payload); if (payload && payload.cmd !== 'masters') schedule(0); return r; };
  server.vendorFinance = async function(payload) { var result = await request('workorder',payload); schedule(0); return result; };
  server.pollNow = pollNow;
  function refresh() { schedule(150); }
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
          var previous;
          var sub = { path: path,
            run: function () { schedule(100); },
            deliver: function (rows) { if (rows === previous) return; previous = rows; var docs = rows.map(snap); next({ docs: docs, size: docs.length, empty: !docs.length, metadata: {}, docChanges: function () { return []; } }); },
            fail: function (e) { previous = undefined; if (error) error(e); } };
          subscriptions.add(sub); schedule(100);
          return function () { subscriptions.delete(sub); };
        }
      };
    }
  };
  var assets = { upload: async function (file) { var data = new FormData(); data.append('file', file); data.append('view', viewKey()); return request('upload', data); } };
  var downloads = { save: async function (o) { var blob = o.data instanceof Blob ? o.data : new Blob([o.data]), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = o.filename || 'download'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 10000); } };
  var user = { isOwner: async function () { await server.ready; return !!(server.user && server.user.owner); }, can: async function () { await server.ready; return !!server.user; }, me: async function () { await server.ready; return server.user; }, profiles: async function (ids) { var result = await request('list', { path: 'masters/users/rows' }, true), out = {}; result.docs.forEach(function (r) { if (ids.indexOf(r.id) !== -1) out[r.id] = { name: r.data.name }; }); return out; }, search: async function (q) { var result = await request('list', { path: 'masters/users/rows' }, true); return result.docs.filter(function (r) { return String(r.data.name).toLowerCase().indexOf(String(q).toLowerCase()) !== -1; }).map(function (r) { return { id: r.id, name: r.data.name }; }); } };
  window.claude = { use: async function (name) { await server.ready; return { db: db, assets: assets, downloads: downloads, user: user }[name] || null; } };
  window.addEventListener('focus', function () { schedule(100); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(pollTimer); pollTimer = null; } else schedule(100); });
  window.addEventListener('hashchange', function () { schedule(300); });
})();
