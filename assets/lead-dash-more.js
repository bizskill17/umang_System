/* Lead Dashboard tabs beyond Overview: team member, process, value & priority, customers & referrals,
   resellers & partners, client type, industry, and business vertical & items. All numbers come from the
   app's own leads, quotations and masters, filtered by the dashboard's period and filters. */
(function () {
  'use strict';
  var U = window.U; if (!U) return;
  var X = function () { return window.UmangLDX; };
  var TABS = [['overview', 'Overview'], ['team', 'By Team Member'], ['process', 'Process and Owners'], ['value', 'Value and Priority'], ['customers', 'Customers and Referrals'],
    ['partners', 'Resellers and Partners'], ['ctype', 'By Client Type'], ['industry', 'Industry'], ['vertical', 'Business Vertical and Items']];
  var COL = { won: '#16a34a', open: '#2a78d6', rej: '#e0a100', lost: '#c9c7bf', bad: '#d03b3b', c1: '#1e4f8f', c2: '#2a78d6', c3: '#9cc2ee', new: '#2a78d6', rep: '#16a34a', old: '#e0a100' };
  // Chance of winning while a lead waits at each stage, for the weighted forecast.
  var WIN = { unassigned: .10, noquote: .15, prepare: .25, check: .30, send: .35, client: .50, rejected: .15, project: .95, won: 1, lost: 0 };
  var DONE = { unassigned: 'Lead assigned to a salesperson', noquote: 'Quotation work assigned', prepare: 'Quotation prepared', check: 'Quotation checked', send: 'Quotation sent to the client',
    client: 'Client approved or rejected', rejected: 'Revised and sent again, or canceled', project: 'Project created' };

  // ---- small helpers ----
  function cust(r) { return U.get(U.m('customers'), r.l.customer_id) || {}; }
  function ctype(r) { return U.nm('customer-category', cust(r).category_id) || 'Not set'; }
  function industry(r) { return U.nm('customer-subcategory', (cust(r).subcategory_ids || [])[0]) || 'Not set'; }
  function vertical(r) { return U.nm('lead-category', r.l.lead_category_id) || 'Not set'; }
  function item(r) { return U.nm('lead-subcategory', r.l.lead_subcategory_id) || 'Not set'; }
  function result(r) { return r.won ? 'won' : r.stage === 'lost' ? 'lost' : r.stage === 'rejected' ? 'rej' : 'open'; }
  function lostish(r) { var o = result(r); return o === 'lost' || o === 'rej'; }
  function weighted(rows) { return rows.reduce(function (a, r) { return a + (r.open ? r.value * (WIN[r.stage] || 0) : 0); }, 0); }
  function group(rows, keyFn) { var G = new Map(); rows.forEach(function (r) { var k = keyFn(r), g = G.get(k); if (!g) G.set(k, g = []); g.push(r); }); return G; }
  function stats(rows) {
    var x = X(), won = rows.filter(function (r) { return r.won; }), lost = rows.filter(lostish), open = rows.filter(function (r) { return r.open; });
    return { n: rows.length, v: x.sum(rows), won: won.length, wv: x.sum(won), lost: lost.length, open: open.length, ov: x.sum(open), od: open.filter(x.isLate).length,
      rate: won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) + '%' : '–' };
  }
  function th(cols) { return '<thead><tr>' + cols.map(function (c) { return '<th' + (c.charAt(0) === '#' ? ' class="num">' + X().E(c.slice(1)) : '>' + X().E(c)) + '</th>'; }).join('') + '</tr></thead>'; }
  function table(cols, rows, cls) { return '<div class="ldx-tw"><table class="ldx-t' + (cls ? ' ' + cls : '') + '">' + th(cols) + '<tbody>' + (rows.join('') || '<tr><td colspan="' + cols.length + '" class="muted">Nothing in this period.</td></tr>') + '</tbody></table></div>'; }
  function td(v, num, cls) { return '<td' + (num ? ' class="num' + (cls ? ' ' + cls : '') + '"' : cls ? ' class="' + cls + '"' : '') + '>' + v + '</td>'; }
  function name2(a, b) { var E = X().E; return '<div class="cname">' + E(a) + '</div>' + (b ? '<div class="muted sm">' + E(b) + '</div>' : ''); }
  function more(st, key, list, n) { n = n || 15; var all = st['all_' + key]; return { rows: all ? list : list.slice(0, n), btn: list.length > n ? '<p><button type="button" class="mv-btn ldm-more" data-a="ldm-all" data-id="' + key + '">' + (all ? 'Show fewer' : 'Show all ' + list.length) + '</button></p>' : '' }; }
  function tiles(arr) { return '<section class="ldx-tiles" aria-label="Key numbers">' + arr.map(function (t) { return '<div class="kpi ldx-tile"><div class="t-label">' + X().E(t[0]) + '</div><div class="t-val' + (t[3] ? ' bad' : '') + '">' + t[1] + '</div><div class="t-sub">' + (t[2] || '') + '</div></div>'; }).join('') + '</section>'; }
  function lastDate(rows) { return rows.reduce(function (m, r) { return r.date > m ? r.date : m; }, ''); }
  function months(R, max) {
    var x = X(), t = x.today(), to = R ? R.to : t, from = R ? R.from : x.addDays(t, -364), out = [], d = new Date(from.slice(0, 8) + '01T00:00:00'), end = new Date(to.slice(0, 8) + '01T00:00:00');
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    while (d <= end) { var s = x.iso(d), e = new Date(d); e.setMonth(e.getMonth() + 1); e.setDate(0); out.push({ s: s, e: x.iso(e), lab: MON[d.getMonth()] + " '" + String(d.getFullYear()).slice(2), tip: MON[d.getMonth()] + ' ' + d.getFullYear() }); d.setMonth(d.getMonth() + 1); }
    return out.slice(-(max || 24));
  }
  // ---- charts ----
  function donut(segs, center, sub) {
    var x = X(), tot = segs.reduce(function (a, s) { return a + s.n; }, 0), C = 2 * Math.PI * 42, off = 0, arcs = '';
    segs.forEach(function (s) { if (!s.n || !tot) return; var len = s.n / tot * C; arcs += '<circle r="42" cx="60" cy="60" fill="none" stroke="' + s.c + '" stroke-width="16" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '"><title>' + x.E(s.k + ': ' + s.n) + '</title></circle>'; off += len; });
    var leg = segs.map(function (s) { return '<li><i class="sw" style="background:' + s.c + '"></i><span>' + x.E(s.k) + (s.v != null ? '<small>' + x.short(s.v) + '</small>' : '') + '</span><b>' + s.n + ' <small>' + (tot ? Math.round(s.n / tot * 100) : 0) + '%</small></b></li>'; }).join('');
    return '<div class="ldm-donut"><svg viewBox="0 0 120 120" role="img" aria-label="' + x.E(center + ' ' + (sub || '')) + '"><circle r="42" cx="60" cy="60" fill="none" stroke="var(--chip)" stroke-width="16"/><g transform="rotate(-90 60 60)">' + arcs + '</g><text x="60" y="60" text-anchor="middle" class="dv">' + x.E(String(center)) + '</text><text x="60" y="76" text-anchor="middle" class="dl">' + x.E(sub || '') + '</text></svg><ul>' + leg + '</ul></div>';
  }
  function legend(items) { return '<div class="ldx-legend">' + items.map(function (i) { return '<span><i class="sw" style="background:' + i[1] + '"></i>' + X().E(i[0]) + '</span>'; }).join('') + '</div>'; }
  // Vertical stacked bars per month; parts = [{v, c, k}].
  function stackChart(buckets, fmt) {
    var x = X(), W = 760, H = 250, m = { l: 54, r: 8, t: 22, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    var mx = Math.max.apply(null, buckets.map(function (b) { return b.parts.reduce(function (a, p) { return a + p.v; }, 0); }).concat([1]));
    var top = niceTop(mx), y = function (v) { return m.t + ih - v / top * ih; }, g = '', b2 = '', slot = iw / Math.max(buckets.length, 1), bw = Math.max(4, Math.min(slot * .66, 46));
    var f = top / Math.pow(10, Math.floor(Math.log10(top))), steps = (f === 1 || f === 2) ? 4 : 5, af = fmt === x.short ? axMoney : fmt;
    for (var i = 0; i <= steps; i++) { var v = top / steps * i; g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="' + (i ? 'gr' : 'ax') + '"/><text x="' + (m.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + x.E(af(v)) + '</text>'; }
    var every = Math.ceil(buckets.length * 46 / iw);
    buckets.forEach(function (b, i) {
      var xx = m.l + slot * i + (slot - bw) / 2, acc = 0, tot = 0, tip = [];
      b.parts.forEach(function (p) { if (p.v > 0) { var h = p.v / top * ih; b2 += '<rect x="' + xx + '" y="' + y(acc + p.v) + '" width="' + bw + '" height="' + Math.max(h, .5) + '" style="fill:' + p.c + '"/>'; acc += p.v; } tot += p.v; tip.push(p.k + ' ' + fmt(p.v)); });
      if (tot > 0) b2 += '<text class="val" x="' + (xx + bw / 2) + '" y="' + (y(tot) - 5) + '" text-anchor="middle">' + x.E(fmt(tot)) + '</text>';
      if ((buckets.length - 1 - i) % every === 0) b2 += '<text x="' + (xx + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + x.E(b.lab) + '</text>';
      b2 += '<rect x="' + (m.l + slot * i) + '" y="' + m.t + '" width="' + slot + '" height="' + ih + '" fill="transparent"><title>' + x.E(b.tip + ': ' + tip.join(' · ')) + '</title></rect>';
    });
    return '<div class="ldx-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' + g + b2 + '</svg></div>';
  }
  function axMoney(v) { var r = function (z) { return String(+z.toFixed(2)); }; return v >= 1e7 ? '₹' + r(v / 1e7) + ' Cr' : v >= 1e5 ? '₹' + r(v / 1e5) + ' L' : v >= 1e3 ? '₹' + r(v / 1e3) + 'k' : '₹' + Math.round(v); }
  function niceTop(v) { var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
  // Horizontal stacked bars: rows = [{k, parts:[{v,c,k}], label}]
  function hstack(rows) {
    var x = X(), mx = Math.max.apply(null, rows.map(function (r) { return r.parts.reduce(function (a, p) { return a + p.v; }, 0); }).concat([1]));
    return '<div class="ldm-hs">' + rows.map(function (r) {
      var tot = r.parts.reduce(function (a, p) { return a + p.v; }, 0);
      return '<div class="ldm-hsr"><span class="k" title="' + x.E(r.k) + '">' + x.E(r.k) + '</span><span class="t">' + r.parts.map(function (p) { return p.v > 0 ? '<i style="width:' + (p.v / mx * 100) + '%;background:' + p.c + '" title="' + x.E(r.k + ' · ' + p.k + ': ' + x.short(p.v)) + '"></i>' : ''; }).join('') + '</span><span class="n">' + (r.label != null ? r.label : x.short(tot)) + '</span></div>';
    }).join('') + '</div>';
  }
  function valueParts(rows) { var x = X(); return [{ k: 'Approved', v: x.sum(rows.filter(function (r) { return r.won; })), c: COL.won }, { k: 'Open', v: x.sum(rows.filter(function (r) { return r.open && r.stage !== 'rejected'; })), c: COL.open }, { k: 'Rejected', v: x.sum(rows.filter(function (r) { return r.stage === 'rejected'; })), c: COL.rej }, { k: 'Canceled', v: x.sum(rows.filter(function (r) { return r.stage === 'lost'; })), c: COL.lost }]; }
  var VLEG = [['Approved', COL.won], ['Open', COL.open], ['Rejected, can revise', COL.rej], ['Canceled', COL.lost]];
  function statusPill(r) { var x = X(); if (!r.open) return r.won ? '<span class="ldx-pill ok">Approved</span>' : '<span class="ldx-pill neutral">Canceled</span>'; var lb = x.lateBy(r); if (lb > 0) return '<span class="ldx-pill bad">Overdue ' + x.fmtD(lb, r.exact) + '</span>'; return r.target && r.age > r.target * .7 ? '<span class="ldx-pill warn">Due soon</span>' : '<span class="ldx-pill neutral">On track</span>'; }
  function prioPill(p) { return p ? '<span class="ldx-pill ' + (p === 'High' ? 'bad' : p === 'Medium' ? 'warn' : 'neutral') + '">' + X().E(p) + '</span>' : '<span class="muted">—</span>'; }
  function leadRows(list) {
    var x = X();
    return list.map(function (r) { var s = x.SBY[r.stage] || {}; return '<tr><td>' + name2(r.l.lead_no || '—', U.nm('customers', r.l.customer_id)) + '</td><td>' + name2(item(r), vertical(r)) + '</td>' + td(x.short(r.value), 1) + td(prioPill(r.l.priority)) + td(x.E(s.name || '')) + td(x.E(U.user(r.l.assigned_to) || 'Unassigned')) + td(r.open ? x.fmtD(r.age, r.exact) : '—', 1) + td(statusPill(r)) + '</tr>'; });
  }
  var LEADCOLS = ['Lead', 'Item', '#Value', 'Priority', 'Waiting at', 'Assigned to', '#Waiting', 'Status'];
  function cross(rows, rowKey, colKey, topCols, st, key, label) {
    var x = X(), cols = Array.from(group(rows, colKey).entries()).sort(function (a, b) { return b[1].length - a[1].length; }).map(function (e) { return e[0]; });
    var shown = cols.slice(0, topCols), other = cols.length > topCols;
    var R = Array.from(group(rows, rowKey).entries()).map(function (e) { return { k: e[0], rows: e[1] }; }).sort(function (a, b) { return b.rows.length - a.rows.length; });
    var mm = more(st, key, R, 12);
    var body = mm.rows.map(function (g) { var c = group(g.rows, colKey); return '<tr><td><div class="cname">' + x.E(g.k) + '</div></td>' + shown.map(function (k) { var a = c.get(k) || []; return td(a.length ? '<span title="' + x.E(x.short(x.sum(a))) + '">' + a.length + '</span>' : '<span class="muted">·</span>', 1); }).join('') + (other ? td(g.rows.filter(function (r) { return shown.indexOf(colKey(r)) < 0; }).length || '<span class="muted">·</span>', 1) : '') + td('<b>' + g.rows.length + '</b>', 1) + td(x.short(x.sum(g.rows)), 1) + '</tr>'; });
    return table([label].concat(shown.map(function (k) { return '#' + k; })).concat(other ? ['#Other'] : []).concat(['#Total', '#Value']), body) + mm.btn;
  }

  // ---- tabs ----
  var T = {};
  T.strip = function (cur) { return '<nav class="ldm-tabs" aria-label="Dashboard views">' + TABS.map(function (t) { return '<button type="button" data-a="ldm-tab" data-id="' + t[0] + '" aria-pressed="' + (cur === t[0]) + '">' + X().E(t[1]) + '</button>'; }).join('') + '</nav>'; };

  T.team = function (c) {
    var x = X(), st = c.st, R = c.R, inP = function (e) { return !R || (e.date >= R.from && e.date <= R.to); };
    var who = group(c.ALL.filter(function (r) { return r.l.assigned_to; }), function (r) { return r.l.assigned_to; });
    var people = Array.from(who.keys()).sort(function (a, b) { return c.C.filter(function (r) { return r.l.assigned_to === b; }).length - c.C.filter(function (r) { return r.l.assigned_to === a; }).length || String(U.user(a)).localeCompare(String(U.user(b))); });
    if (!people.length) return x.panel('tm', 'By team member', '', '<p class="muted">No leads are assigned yet.</p>');
    var me = people.indexOf(st.member) >= 0 ? st.member : people[0];
    var mine = c.C.filter(function (r) { return r.l.assigned_to === me; }), openM = c.open.filter(function (r) { return r.l.assigned_to === me; }), od = openM.filter(x.isLate), s = stats(mine);
    var EVall = x.stageEvents(c.ALL).filter(function (e) { return e.by === me; }), EV = EVall.filter(inP), ok = EV.filter(function (e) { return e.ok; }).length, avgH = EV.length ? EV.reduce(function (a, e) { return a + e.h; }, 0) / EV.length : null;
    var rank = people.map(function (p) { return { p: p, v: x.sum(c.C.filter(function (r) { return r.l.assigned_to === p && r.won; })) }; }).sort(function (a, b) { return b.v - a.v; }).map(function (z) { return z.p; }).indexOf(me) + 1;
    var h = '<div class="ldm-pick"><label>Team member <select data-onchange="ldm-member">' + people.map(function (p) { return '<option value="' + x.E(p) + '"' + (p === me ? ' selected' : '') + '>' + x.E(U.user(p) || 'Unknown') + '</option>'; }).join('') + '</select></label></div>';
    h += tiles([['Stages finished', EV.length, 'Recorded from 12/11/2026'], ['On time', x.pct(ok, EV.length), ok + ' of ' + EV.length + ' within target'], ['Avg turnaround', x.fmtH(avgH), 'Per stage'], ['Pending now', openM.length, 'Open leads assigned'],
      ['Overdue now', od.length, openM.length ? x.pct(od.length, openM.length) + ' of pending' : 'nothing pending', od.length > 0], ['Value handled', x.short(s.v), x.plural(s.n, 'lead') + ' in the period'], ['Approval rate', s.rate, s.won + ' approved · ' + s.lost + ' lost'], ['Team rank', '#' + rank + ' <small>of ' + people.length + '</small>', 'By approved value']]);
    var stg = x.OPEN_STAGES.map(function (sd) { var e = EV.filter(function (z) { return z.stage === sd.k; }), p = openM.filter(function (r) { return r.stage === sd.k; }); if (!e.length && !p.length) return ''; var a = e.length ? e.reduce(function (q, z) { return q + z.h; }, 0) / e.length : null; return '<tr>' + td(x.E(sd.name)) + td(e.length, 1) + td(x.pct(e.filter(function (z) { return z.ok; }).length, e.length), 1) + td(x.fmtH(a), 1) + td(p.length, 1) + td(p.filter(x.isLate).length || 0, 1, p.filter(x.isLate).length ? 'bad' : '') + '</tr>'; }).filter(Boolean);
    var res = donut([{ k: 'Approved', n: s.won, v: s.wv, c: COL.won }, { k: 'Open', n: mine.filter(function (r) { return r.open && r.stage !== 'rejected'; }).length, v: x.sum(mine.filter(function (r) { return r.open && r.stage !== 'rejected'; })), c: COL.open }, { k: 'Rejected', n: mine.filter(function (r) { return r.stage === 'rejected'; }).length, c: COL.rej }, { k: 'Canceled', n: mine.filter(function (r) { return r.stage === 'lost'; }).length, c: COL.lost }], s.n, 'leads');
    h += '<div class="ldx-g2 ldm-wide1">' + x.panel('tms', 'Work by stage', 'Stages this person finished in the period, and what is waiting on them now.', table(['Stage', '#Done', '#On time', '#Avg', '#Pending', '#Overdue'], stg)) + x.panel('tmr', 'Results of their leads', 'Every lead assigned to them that came in during the period.', res) + '</div>';
    var ms = months(null, 12).reverse().map(function (b) { var l = c.ALL.filter(function (r) { return r.l.assigned_to === me && r.date >= b.s && r.date <= b.e; }), e = EVall.filter(function (z) { return z.date >= b.s && z.date <= b.e; }); return '<tr>' + td(x.E(b.tip)) + td(l.length, 1) + td(l.filter(function (r) { return r.won; }).length, 1) + td(x.short(x.sum(l)), 1) + td(e.length, 1) + td(x.pct(e.filter(function (z) { return z.ok; }).length, e.length), 1) + '</tr>'; });
    h += x.panel('tmm', 'Month by month', 'The last 12 months.', table(['Month', '#Leads received', '#Approved', '#Value', '#Stages done', '#On time'], ms));
    var q = openM.slice().sort(function (a, b) { return x.lateBy(b) - x.lateBy(a) || b.age - a.age; }), mm = more(st, 'tmq', q);
    h += x.panel('tmq', 'Their open queue', 'Leads waiting on ' + x.E(U.user(me) || 'them') + ' right now, most overdue first.', table(LEADCOLS, leadRows(mm.rows)) + mm.btn);
    return h;
  };

  T.process = function (c) {
    var x = X(), R = c.R, EV = x.stageEvents(c.ALL).filter(function (e) { return !R || (e.date >= R.from && e.date <= R.to); });
    var flow = x.OPEN_STAGES.map(function (sd, i) { var o = c.open.filter(function (r) { return r.stage === sd.k; }), l = o.filter(x.isLate).length; return '<div class="ldm-stage"><div class="no">Stage ' + (i + 1) + '</div><div class="nm">' + x.E(sd.name) + '</div><div class="muted sm">' + x.E(sd.note || '') + '</div><div class="ldm-chips"><span class="ldx-pill neutral">' + x.E(x.tgt(sd.target)) + '</span>' + (o.length ? '<span class="ldx-pill ' + (l ? 'bad' : 'ok') + '">' + o.length + ' open' + (l ? ' · ' + l + ' late' : '') + '</span>' : '') + '</div></div>'; }).join('<span class="ldm-arrow" aria-hidden="true">→</span>');
    flow += '<span class="ldm-arrow" aria-hidden="true">→</span><div class="ldm-stage res"><div class="no">Result</div><div class="nm">Won or lost</div><div class="muted sm">Project created, or lead canceled</div></div>';
    var h = x.panel('pf', 'Lead process flow', 'Every lead moves through these stages. Each stage has a target; past it the lead shows as overdue. Targets are set in Dashboard Settings.', '<div class="ldm-flow">' + flow + '</div>');
    var rules = x.OPEN_STAGES.map(function (sd, i) { var e = EV.filter(function (z) { return z.stage === sd.k; }), o = c.open.filter(function (r) { return r.stage === sd.k; }), a = e.length ? e.reduce(function (q, z) { return q + z.h; }, 0) / e.length : null, l = o.filter(x.isLate).length; return '<tr>' + td(i + 1, 1) + td(x.E(sd.name)) + td(x.E(sd.note || '')) + td(x.E(x.tgt(sd.target))) + td(Math.round((WIN[sd.k] || 0) * 100) + '%', 1) + td(x.E(DONE[sd.k] || '')) + td(o.length, 1) + td(l, 1, l ? 'bad' : '') + td(x.fmtH(a), 1) + '</tr>'; });
    h += x.panel('pr', 'Stage rules', 'What “done” means at each stage, the chance of winning while a lead waits there (used for the weighted forecast), and how the stage is doing.', table(['#', 'Stage', 'Who works it', 'Target', '#Win chance', 'Done means', '#Open now', '#Overdue', '#Avg time taken'], rules, 'wrap'));
    var P = {}; EV.forEach(function (e) { var p = P[e.by] || (P[e.by] = { id: e.by, n: 0, ok: 0, st: {} }); p.n++; if (e.ok) p.ok++; p.st[e.stage] = (p.st[e.stage] || 0) + 1; });
    var roles = Object.values(P).sort(function (a, b) { return b.n - a.n; }).map(function (p) { var top = Object.keys(p.st).sort(function (a, b) { return p.st[b] - p.st[a]; }).map(function (k) { return (x.SBY[k] || {}).name + ' (' + p.st[k] + ')'; }).join(', '); return '<tr>' + td(name2(p.id === 'server-owner' ? 'Administrator' : U.user(p.id) || 'Not recorded')) + td(x.E(top)) + td(p.n, 1) + td(x.pct(p.ok, p.n), 1) + '</tr>'; });
    h += x.panel('ro', 'Who owns what', 'Stages each person actually finished in the period (from the times recorded since 12/11/2026).', table(['Who', 'Stages finished', '#Total', '#On time'], roles, 'wrap'));
    return h;
  };

  T.value = function (c) {
    var x = X(), C = c.C, st = c.st, s = stats(C), vals = C.map(function (r) { return r.value; }).sort(function (a, b) { return a - b; }), med = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
    var openC = C.filter(function (r) { return r.open; }), hv = C.filter(function (r) { return r.value >= 5e5; });
    var h = tiles([['Total lead value', x.short(s.v), x.plural(s.n, 'lead')], ['Open pipeline', x.short(x.sum(openC)), openC.length + ' open'], ['Weighted forecast', x.short(weighted(openC)), 'Value × stage win chance'], ['Approved value', x.short(s.wv), s.won + ' approved'],
      ['Average lead', x.short(s.n ? s.v / s.n : 0), 'Median ' + x.short(med)], ['High-value leads', hv.length, '₹5 L and above · ' + x.short(x.sum(hv))]]);
    var pr = ['High', 'Medium', 'Low'].map(function (p, i) { var a = C.filter(function (r) { return (r.l.priority || '') === p; }); return { k: p, n: a.length, v: x.sum(a), c: [COL.c1, COL.c2, COL.c3][i] }; });
    var np = C.filter(function (r) { return ['High', 'Medium', 'Low'].indexOf(r.l.priority) < 0; }); if (np.length) pr.push({ k: 'Not set', n: np.length, v: x.sum(np), c: COL.lost });
    var band = [['High value', function (v) { return v >= 5e5; }], ['Medium value', function (v) { return v >= 1e5 && v < 5e5; }], ['Low value', function (v) { return v < 1e5; }]].map(function (b, i) { var a = C.filter(function (r) { return b[1](r.value); }); return { k: b[0], n: a.length, v: x.sum(a), c: [COL.c1, COL.c2, COL.c3][i] }; });
    var stv = [['Open', COL.open, function (r) { return r.open && r.stage !== 'rejected'; }], ['Approved', COL.won, function (r) { return r.won; }], ['Rejected', COL.rej, function (r) { return r.stage === 'rejected'; }], ['Canceled', COL.lost, function (r) { return r.stage === 'lost'; }]].map(function (b) { var a = C.filter(b[2]); return { k: b[0], n: a.length, v: x.sum(a), c: b[1] }; });
    h += '<div class="ldx-g3">' + x.panel('vp', 'Lead priority', 'Priority set on the lead.', donut(pr, s.n, 'leads')) + x.panel('vb', 'High, medium & low value', 'High ≥ ₹5 L · Medium ₹1–5 L · Low < ₹1 L', donut(band, s.n, 'leads')) + x.panel('vs', 'Lead status', 'Where the period’s leads stand now.', donut(stv, s.n, 'leads')) + '</div>';
    var bk = months(c.R, 24).map(function (b) { var a = C.filter(function (r) { return r.date >= b.s && r.date <= b.e; }); return { lab: b.lab, tip: b.tip, parts: valueParts(a) }; });
    h += x.panel('vm', 'Lead value by month', 'Value of leads received each month, by where they stand now.', legend(VLEG) + stackChart(bk, x.short));
    var bySt = x.OPEN_STAGES.map(function (sd) { var a = c.open.filter(function (r) { return r.stage === sd.k && (!c.R || (r.date >= c.R.from && r.date <= c.R.to)); }); return { k: sd.name, parts: [{ k: 'Open', v: x.sum(a), c: a.some(x.isLate) ? COL.open : COL.open }], label: x.short(x.sum(a)) }; });
    var byType = Array.from(group(C, ctype).entries()).map(function (e) { return { k: e[0], parts: valueParts(e[1]) }; }).sort(function (a, b) { return tv(b) - tv(a); }).slice(0, 10);
    h += '<div class="ldx-g2">' + x.panel('vst', 'Open pipeline value by stage', 'Value of open leads by the stage they are waiting at.', hstack(bySt)) + x.panel('vct', 'Value by client type', 'Top 10 client types by lead value.', legend(VLEG) + hstack(byType)) + '</div>';
    var byV = Array.from(group(C, vertical).entries()).map(function (e) { return { k: e[0], parts: valueParts(e[1]) }; }).sort(function (a, b) { return tv(b) - tv(a); }).slice(0, 15);
    h += x.panel('vv', 'Value by business vertical', 'Top 15 verticals (lead categories) by lead value.', legend(VLEG) + hstack(byV));
    var big = openC.slice().sort(function (a, b) { return b.value - a.value; }), mm = more(st, 'vbig', big);
    h += x.panel('vbig', 'Biggest open leads', 'Largest open leads received in the period.', table(LEADCOLS, leadRows(mm.rows)) + mm.btn);
    return h;
  };
  function tv(r) { return r.parts.reduce(function (a, p) { return a + p.v; }, 0); }

  // New = the customer's first lead; Repeat = they had a lead in the 12 months before; Old = their last lead was over a year before.
  var HIST = new WeakMap();
  function history(ALLL) {
    var m = HIST.get(ALLL); if (m) return m; m = new Map(); var by = new Map();
    ALLL.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).forEach(function (r) { var k = r.l.customer_id || ''; var prev = by.get(k); m.set(r.l.id, !k || !prev ? 'New' : X().days(prev, r.date) <= 365 ? 'Repeat' : 'Old'); by.set(k, r.date); });
    HIST.set(ALLL, m); return m;
  }
  var PERSONLIKE = /employee|staff|referr|refer/i;
  function referrer(r) {
    var src = U.nm('lead-sources', r.l.lead_source_id) || ''; if (!src) return '';
    if (PERSONLIKE.test(src) || /existing client/i.test(src)) return src;
    var low = src.toLowerCase().trim(), us = U.mrows('users');
    return us.some(function (u) { var n = String(u.name || '').toLowerCase().trim(); return n && (n === low || n.split(' ')[0] === low.split(' ')[0] && low.split(' ').length > 1); }) ? src : '';
  }
  T.customers = function (c) {
    var x = X(), H = history(c.ALL), cls = function (r) { return H.get(r.l.id) || 'New'; }, C = c.C, G = group(C, cls), ref = C.filter(function (r) { return referrer(r); }), refP = ref.filter(function (r) { return !/existing client/i.test(referrer(r)); });
    var t = ['New', 'Repeat', 'Old'].map(function (k) { var a = G.get(k) || [], s = stats(a); return [k + ' customer', s.n, x.pct(s.n, C.length) + ' of leads · ' + s.rate + ' approved']; });
    var sr = stats(refP); t.push(['Referred by a person', sr.n, x.pct(sr.n, C.length) + ' of leads · ' + sr.rate + ' approved']);
    var h = tiles(t) + '<p class="muted sm ldm-note">New = the customer’s first lead · Repeat = they sent a lead in the 12 months before · Old = a past customer coming back after more than a year. Referred by a person = the lead source is a team member, an employee or another person (existing-client referrals are listed in the table below).</p>';
    var bk = months(c.R, 24).map(function (b) { var a = c.ALL.filter(function (r) { return r.date >= b.s && r.date <= b.e; }); return { lab: b.lab, tip: b.tip, parts: [{ k: 'New', v: a.filter(function (r) { return cls(r) === 'New'; }).length, c: COL.new }, { k: 'Repeat', v: a.filter(function (r) { return cls(r) === 'Repeat'; }).length, c: COL.rep }, { k: 'Old', v: a.filter(function (r) { return cls(r) === 'Old'; }).length, c: COL.old }] }; });
    h += x.panel('cm', 'New, repeat & old customers', 'Leads received per month by customer history.', legend([['New', COL.new], ['Repeat', COL.rep], ['Old', COL.old]]) + stackChart(bk, function (v) { return String(Math.round(v)); }));
    var res = ['New', 'Repeat', 'Old'].map(function (k) { var s = stats(G.get(k) || []); return '<tr>' + td(x.E(k)) + td(s.n, 1) + td(x.short(s.v), 1) + td(s.open, 1) + td(s.won, 1) + td(s.lost, 1) + td(s.rate, 1) + td(x.short(s.wv), 1) + '</tr>'; });
    var RF = Array.from(group(ref, referrer).entries()).map(function (e) { return { k: e[0], s: stats(e[1]) }; }).sort(function (a, b) { return b.s.n - a.s.n; });
    h += '<div class="ldx-g2">' + x.panel('ch', 'Customer history results', 'How each customer group converts. Lost includes rejected and canceled.', table(['Customer', '#Leads', '#Value', '#Open', '#Approved', '#Lost', '#Approval %', '#Approved value'], res)) +
      x.panel('cr', 'Who referred the lead', 'Leads whose source is a person or an existing client.', table(['Referred by', '#Leads', '#Approved', '#Approval %', '#Approved value'], RF.map(function (z) { return '<tr>' + td(x.E(z.k)) + td(z.s.n, 1) + td(z.s.won, 1) + td(z.s.rate, 1) + td(x.short(z.s.wv), 1) + '</tr>'; }))) + '</div>';
    h += x.panel('cct', 'Customer history by client type', 'Lead count.', cross(C, cls, ctype, 5, c.st, 'cct', 'Customer'));
    return h;
  };

  var PARTNER = /agency|architect|event|reseller|contractor|dealer|partner|interior|builder|printer/i;
  T.partners = function (c) {
    var x = X(), st = c.st, t = x.today(), cats = U.mrows('customer-category').filter(function (k) { return PARTNER.test(k.name || ''); }), ids = new Set(cats.map(function (k) { return k.id; }));
    var allP = c.ALL.filter(function (r) { return ids.has(cust(r).category_id); }), byC = group(allP, function (r) { return r.l.customer_id; }), inP = c.C.filter(function (r) { return ids.has(cust(r).category_id); });
    var since24 = x.addDays(t, -730), list = Array.from(byC.entries()).map(function (e) {
      var cu = U.get(U.m('customers'), e[0]) || {}, mine = inP.filter(function (r) { return r.l.customer_id === e[0]; }), s = stats(mine), last = lastDate(e[1]), w24 = x.sum(e[1].filter(function (r) { return r.won && r.date >= since24; })), d = x.days(last, t);
      return { cu: cu, kind: U.nm('customer-category', cu.category_id), s: s, last: last, tier: w24 >= 1e6 ? 'Gold' : w24 >= 3e5 ? 'Silver' : w24 > 0 ? 'Bronze' : '', status: d <= 60 ? 'Active' : d <= 180 ? 'Dormant' : 'Inactive' };
    }).sort(function (a, b) { return b.s.wv - a.s.wv || b.s.n - a.s.n || (a.last < b.last ? 1 : -1); });
    var kinds = Array.from(group(list, function (p) { return p.kind || 'Other'; }).entries()).map(function (e) { return e[1].length + ' ' + e[0]; }).join(' · ');
    var sIn = stats(inP), h = tiles([['Partners listed', list.length, kinds || 'Agencies, architects, event planners…'], ['Active partners', list.filter(function (p) { return p.status === 'Active'; }).length, 'Sent a lead in the last 60 days'], ['Leads sent', sIn.n, x.pct(sIn.n, c.C.length) + ' of all leads in the period'], ['Approved value', x.short(sIn.wv), sIn.won + ' approved']]);
    var mm = more(st, 'pl', list, 25), rows = mm.rows.map(function (p) { var ph = (p.cu.contacts && p.cu.contacts[0] && (p.cu.contacts[0].mobile || p.cu.contacts[0].phone)) || p.cu.mobile || ''; return '<tr>' + td(name2(p.cu.name || '—', U.nm('city', p.cu.city_id))) + td(x.E(p.kind || '')) + td(x.E(ph)) + td(p.s.n, 1) + td(p.s.won, 1) + td(x.short(p.s.wv), 1) + td(p.last ? U.dmy(p.last) : '—') + td(p.tier ? '<span class="ldx-pill ' + (p.tier === 'Gold' ? 'warn' : 'neutral') + '">' + p.tier + '</span>' : '<span class="muted">—</span>') + td('<span class="ldx-pill ' + (p.status === 'Active' ? 'ok' : p.status === 'Dormant' ? 'warn' : 'neutral') + '">' + p.status + '</span>') + '</tr>'; });
    h += x.panel('pl', 'Partner list', 'Customers whose client type is ' + x.E(cats.map(function (k) { return k.name; }).join(', ') || 'a partner type') + '. Leads and approved value are for the period; tier is by approved value over 24 months: Gold ≥ ₹10 L, Silver ≥ ₹3 L.', table(['Partner', 'Kind', 'Contact', '#Leads sent', '#Approved', '#Approved value', 'Last lead', 'Tier', 'Status'], rows) + mm.btn);
    return h;
  };

  T.ctype = function (c) {
    var x = X(), st = c.st, G = Array.from(group(c.C, ctype).entries()).map(function (e) { return { k: e[0], rows: e[1], s: stats(e[1]) }; }).sort(function (a, b) { return b.s.n - a.s.n; });
    var h = tiles(G.slice(0, 6).map(function (g) { return [g.k, g.s.n, x.short(g.s.v) + ' · ' + g.s.rate + ' approved']; }));
    h += x.panel('ctv', 'Client type by business vertical', 'Lead count; hover a number for its value.', cross(c.C, vertical, ctype, 5, st, 'ctv', 'Vertical'));
    var CL = Array.from(group(c.C, function (r) { return r.l.customer_id || ''; }).entries()).map(function (e) { return { r: e[1][0], s: stats(e[1]), last: lastDate(e[1]) }; }).sort(function (a, b) { return b.s.v - a.s.v; }), mm = more(st, 'ctc', CL);
    h += x.panel('ctc', 'Top clients', 'Clients ranked by lead value in this period.', table(['Client', 'Type', '#Leads', '#Value', '#Approved', '#Approved value', 'Last lead'], mm.rows.map(function (z) { return '<tr>' + td(name2(U.nm('customers', z.r.l.customer_id) || '—', industry(z.r))) + td(x.E(ctype(z.r))) + td(z.s.n, 1) + td(x.short(z.s.v), 1) + td(z.s.won, 1) + td(x.short(z.s.wv), 1) + td(z.last ? U.dmy(z.last) : '—') + '</tr>'; })) + mm.btn);
    return h;
  };

  T.industry = function (c) {
    var x = X(), st = c.st, G = Array.from(group(c.C, industry).entries()).map(function (e) { var hs = e[1].map(function (r) { var ra = x.receivedAt(r.l); return ra && r.l.first_contact_at ? x.hoursBetween(ra, r.l.first_contact_at) : null; }).filter(function (v) { return v != null; }); return { k: e[0], s: stats(e[1]), rep: hs.length ? hs.reduce(function (a, b) { return a + b; }, 0) / hs.length : null }; }).sort(function (a, b) { return b.s.v - a.s.v; });
    var mm = more(st, 'ind', G, 15);
    var h = x.panel('ind', 'Leads by industry', 'Industry is the customer’s sub-category. Open and overdue are right now; 1st reply is the average time to the first follow-up (recorded from 12/11/2026).', table(['Industry', '#Leads', '#Value', '#Open', '#Overdue', '#Approved', '#Approval %', '#1st reply'], mm.rows.map(function (g) { return '<tr>' + td('<div class="cname">' + x.E(g.k) + '</div>') + td(g.s.n, 1) + td(x.short(g.s.v), 1) + td(g.s.open, 1) + td(g.s.od, 1, g.s.od ? 'bad' : '') + td(g.s.won, 1) + td(g.s.rate, 1) + td(x.fmtH(g.rep), 1) + '</tr>'; })) + mm.btn);
    h += x.panel('ict', 'Industry by client type', 'Lead count.', cross(c.C, industry, ctype, 5, st, 'ict', 'Industry'));
    return h;
  };

  T.vertical = function (c) {
    var x = X(), st = c.st, G = Array.from(group(c.C, vertical).entries()).map(function (e) { return { k: e[0], s: stats(e[1]) }; }).sort(function (a, b) { return b.s.v - a.s.v; });
    var vm = more(st, 'bv', G, 15);
    var h = x.panel('bv', 'Business verticals', 'Business vertical is the lead category.', table(['Vertical', '#Leads', '#Value', '#Open', '#Overdue', '#Approved', '#Approval %', '#Approved value', '#Avg lead'], vm.rows.map(function (g) { return '<tr>' + td('<div class="cname">' + x.E(g.k) + '</div>') + td(g.s.n, 1) + td(x.short(g.s.v), 1) + td(g.s.open, 1) + td(g.s.od, 1, g.s.od ? 'bad' : '') + td(g.s.won, 1) + td(g.s.rate, 1) + td(x.short(g.s.wv), 1) + td(x.short(g.s.n ? g.s.v / g.s.n : 0), 1) + '</tr>'; })) + vm.btn);
    var q = String(st.itemQ || '').toLowerCase().trim(), I = Array.from(group(c.C, function (r) { return item(r) + '\u0001' + vertical(r); }).entries()).map(function (e) { var p = e[0].split('\u0001'); return { k: p[0], v: p[1], s: stats(e[1]) }; })
      .filter(function (z) { return !q || (z.k + ' ' + z.v).toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return b.s.n - a.s.n; }), im = more(st, 'bi', I, 25);
    var tools = '<input type="search" id="ldm-itemq" class="ldm-search" placeholder="Search items or verticals" value="' + x.E(st.itemQ || '') + '" data-oninput="ldm-itemq" aria-label="Search items or verticals">';
    h += x.panel('bi', 'All items', 'Every item (lead sub-category) enquired about in this period.', table(['Item', 'Vertical', '#Leads', '#Value', '#Open', '#Approved', '#Approval %', '#Avg value'], im.rows.map(function (z) { return '<tr>' + td('<div class="cname">' + x.E(z.k) + '</div>') + td(x.E(z.v)) + td(z.s.n, 1) + td(x.short(z.s.v), 1) + td(z.s.open, 1) + td(z.s.won, 1) + td(z.s.rate, 1) + td(x.short(z.s.n ? z.s.v / z.s.n : 0), 1) + '</tr>'; })) + im.btn, tools);
    return h;
  };

  window.UmangLeadTabs = T;
  U.act('ldm-tab', function (v) { U.st().tab = v; U.paint(); window.scrollTo({ top: 0 }); });
  U.act('ldm-member', function (el) { U.st().member = el.value; U.paint(); });
  U.act('ldm-all', function (k) { var s = U.st(); s['all_' + k] = !s['all_' + k]; U.paint(); });
  var qt; U.act('ldm-itemq', function (el) { clearTimeout(qt); var v = el.value; qt = setTimeout(function () { var c = el.selectionStart; U.st().itemQ = v; U.paint(); var n = document.getElementById('ldm-itemq'); if (n) { n.focus(); try { n.setSelectionRange(c, c); } catch (e) { } } }, 250); });
})();
