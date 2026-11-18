// ui/dom.js — small helpers every screen uses.

export const $ = (id) => document.getElementById(id);

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (v) => (typeof v === 'number' && Number.isFinite(v)
  ? (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '—');
export const num2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
export const pctFmt = (v) => String(Math.round(v * 10) / 10);
export const parseMoney = (s) => {
  const v = parseFloat(String(s == null ? '' : s).replace(/[$,%\s]/g, ''));
  return Number.isFinite(v) ? v : null;
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmtDate = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const ICON_CHANGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v3h3M4 13a8 8 0 0 0 14.6 4.5M20 20v-3h-3"/></svg>';
export const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';

let toastTimer = null;
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
}

/** In-page replacement for confirm() and prompt(). Resolves null on cancel. */
export function ask({ title, text, input, okLabel, danger }) {
  return new Promise((resolve) => {
    const dlg = $('askDlg');
    const inp = $('askInput');
    $('askTitle').textContent = title;
    $('askText').textContent = text || '';
    $('askText').hidden = !text;
    inp.hidden = input == null;
    inp.value = input || '';
    $('askOk').textContent = okLabel || 'OK';
    $('askOk').style.color = danger ? 'var(--bad)' : '';
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      $('askOk').onclick = $('askCancel').onclick = dlg.onclose = null;
      if (dlg.open) dlg.close();
      resolve(v);
    };
    dlg.onclose = () => done(null);
    $('askOk').onclick = () => done(input == null ? true : inp.value.trim());
    $('askCancel').onclick = () => done(null);
    dlg.showModal();
    if (input != null) setTimeout(() => { inp.focus(); inp.select(); }, 50);
  });
}
