/* Spinners wherever the app makes people wait:
   - any button showing a busy word ("Saving…", "Sending…", "Preparing PDF…", "Signing in…" …) or marked busy,
   - any short message saying something is loading,
   - a small "Loading data…" badge while a list is downloaded for the first time on this device. */
(function () {
  'use strict';
  var BUSY = /^(Saving|Loading|Working|Testing|Sending|Preparing|Optimising|Uploading|Opening|Making|Importing|Generating|Downloading|Signing in|Checking|Deleting|Removing|Exporting|Backing up|Restoring|Updating|Processing|Applying|Creating)\b[^\n]{0,80}(…|\.\.\.)$/;
  var CSS = '.u-spin{display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;margin-right:8px;animation:u-spin .7s linear infinite;flex-shrink:0;opacity:.85}' +
    '.mv-note .u-spin,.mf-hint .u-spin{color:var(--accent,#5b3fd6)}' +
    '@keyframes u-spin{to{transform:rotate(360deg)}}' +
    '#u-syncing{position:fixed;right:16px;bottom:16px;z-index:9999;display:none;align-items:center;padding:8px 14px;border-radius:999px;background:#1f2937;color:#fff;font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)}' +
    'html.u-syncing #u-syncing{display:inline-flex}' +
    '@media(prefers-reduced-motion:reduce){.u-spin{animation-duration:2.4s}}';
  function has(el) { return el.querySelector('.u-spin,.ops-spinner'); }
  function spin(el) { if (!has(el)) el.insertAdjacentHTML('afterbegin', '<span class="u-spin" aria-hidden="true"></span>'); }
  function unspin(el) { var x = el.querySelector(':scope > .u-spin'); if (x) x.remove(); }
  function text(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function scan() {
    queued = false;
    document.querySelectorAll('button, .mv-btn, .login-btn').forEach(function (b) {
      var busy = (b.disabled || b.getAttribute('aria-busy') === 'true') && (BUSY.test(text(b)) || b.getAttribute('aria-busy') === 'true');
      if (busy) spin(b); else unspin(b);
    });
    // Short loading messages: a paragraph or box whose own text says it is loading.
    document.querySelectorAll('.mv-note, .mf-hint, .msb-wait, .mv-empty, [role=status], .login-msg, p, .muted').forEach(function (el) {
      if (el.closest('button') || el.children.length > 2) return;
      var t = text(el); if (t.length > 120) return;
      if (BUSY.test(t)) spin(el);
    });
  }
  var queued = false;
  function queue() { if (!queued) { queued = true; requestAnimationFrame(scan); } }
  function start() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var pill = document.createElement('div'); pill.id = 'u-syncing'; pill.setAttribute('role', 'status'); pill.innerHTML = '<span class="u-spin" aria-hidden="true"></span>Loading data…'; document.body.appendChild(pill);
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'aria-busy'] });
    scan();
  }
  // Called by the data connection while it downloads lists this device doesn't have yet.
  window.UmangBusy = function (on) { document.documentElement.classList.toggle('u-syncing', !!on); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
