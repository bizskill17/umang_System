/* Every date box in the app shows and takes dates as dd/mm/yyyy, whatever the browser's own language.
   The original <input type="date"> stays in the page (hidden behind a calendar button) and keeps the
   yyyy-mm-dd value the app reads and saves; a text box beside it shows the same date as dd/mm/yyyy. */
(function () {
  'use strict';
  var NATIVE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  var touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  function toDmy(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
  // Accepts 7/3/2026, 07-03-2026, 07.03.2026, 07032026 and 7/3/26.
  function toIso(s) {
    s = String(s || '').trim(); if (!s) return '';
    var m = s.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2}|\d{4})$/) || s.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3]; if (y < 100) y += 2000;
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
  }
  function fire(el) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  var CSS = '.dmy-wrap{position:relative;display:block;min-width:8.5em}.mv-filter .dmy-wrap{display:inline-block;vertical-align:middle}' +
    '.dmy-wrap>input.dmy-text{width:100%;box-sizing:border-box;padding-right:2.2em}' +
    '.dmy-wrap>input[type=date]{position:absolute!important;right:0;top:0;width:2em!important;height:100%!important;opacity:0;pointer-events:none;padding:0!important;margin:0!important;border:0!important}' +
    '.dmy-cal{position:absolute;right:.35em;top:50%;transform:translateY(-50%);width:1.6em;height:1.6em;border:0;background:none;padding:0;cursor:pointer;color:inherit;opacity:.7;display:flex;align-items:center;justify-content:center}' +
    '.dmy-cal:hover{opacity:1}.dmy-cal svg{width:1.05em;height:1.05em}.dmy-text.dmy-bad{border-color:#c0392b!important;outline-color:#c0392b}';
  function addCss() { if (document.getElementById('dmy-css')) return; var s = document.createElement('style'); s.id = 'dmy-css'; s.textContent = CSS; document.head.appendChild(s); }
  var ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4"/></svg>';

  function enhance(inp) {
    if (inp.__dmy) return; inp.__dmy = true;
    var wrap = document.createElement('span'); wrap.className = 'dmy-wrap';
    var txt = document.createElement('input'); txt.type = 'text'; txt.className = 'dmy-text' + (inp.className ? ' ' + inp.className : '');
    txt.placeholder = 'dd/mm/yyyy'; txt.autocomplete = 'off'; txt.inputMode = 'numeric'; txt.maxLength = 10;
    if (inp.getAttribute('aria-label')) txt.setAttribute('aria-label', inp.getAttribute('aria-label'));
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dmy-cal'; btn.tabIndex = -1; btn.title = 'Pick a date'; btn.setAttribute('aria-label', 'Pick a date'); btn.innerHTML = ICON;
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(txt); wrap.appendChild(inp); wrap.appendChild(btn);
    // A label pointing at the date box now points at the text box people type in.
    if (inp.id) { txt.id = inp.id + '__dmy'; document.querySelectorAll('label[for="' + inp.id + '"]').forEach(function (l) { l.htmlFor = txt.id; }); }
    inp.tabIndex = -1; inp.setAttribute('aria-hidden', 'true');
    function show() { txt.value = toDmy(NATIVE.get.call(inp)); txt.classList.remove('dmy-bad'); txt.disabled = inp.disabled; txt.readOnly = inp.readOnly || touch; btn.disabled = inp.disabled || inp.readOnly; }
    // Code that sets the date box's value directly also updates what is shown.
    Object.defineProperty(inp, 'value', { configurable: true, get: function () { return NATIVE.get.call(this); }, set: function (v) { NATIVE.set.call(this, v); show(); } });
    show();
    function commit(final) {
      var iso = toIso(txt.value);
      if (iso === null) { if (final) txt.classList.add('dmy-bad'); return; }
      if ((inp.min && iso && iso < inp.min) || (inp.max && iso && iso > inp.max)) { if (final) txt.classList.add('dmy-bad'); return; }
      txt.classList.remove('dmy-bad');
      if (iso !== NATIVE.get.call(inp)) { NATIVE.set.call(inp, iso); fire(inp); }
      if (final && iso) txt.value = toDmy(iso);
    }
    txt.addEventListener('input', function () {
      // Typing 07112026 or 7/11/2026 fills the slashes in as you go.
      var v = txt.value;
      if (/^\d{8}$/.test(v)) txt.value = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
      if (txt.value.length >= 8 || txt.value === '') commit(false);
    });
    txt.addEventListener('change', function () { commit(true); });
    txt.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(true); });
    function pick() { if (inp.disabled || inp.readOnly) return; try { inp.showPicker(); } catch (e) { inp.style.pointerEvents = 'auto'; inp.focus(); inp.click(); } }
    btn.addEventListener('click', pick);
    if (touch) txt.addEventListener('click', pick);
    inp.addEventListener('input', show); inp.addEventListener('change', show);
    // When the app puts the cursor back in a date box after redrawing, it goes to the text box.
    inp.addEventListener('focus', function () { if (!touch) txt.focus(); });
  }
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('input[type=date]')) enhance(root);
    root.querySelectorAll('input[type=date]').forEach(enhance);
  }
  function start() {
    addCss(); scan(document.body);
    new MutationObserver(function (list) { list.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); }); })
      .observe(document.body, { childList: true, subtree: true });
  }
  window.UmangDates = { toDmy: toDmy, toIso: toIso, enhance: enhance };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
