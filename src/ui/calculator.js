// ui/calculator.js — the everyday calculator sheet (separate from the offer calculator).
// Keypad, keyboard on a laptop, one-tap insert of the bucket's market value / offer / paid,
// and tap the answer to copy it. The maths lives in src/calc.js.

import { activeBucket } from '../state.js';
import { bucketStats } from '../buckets.js';
import { display, initialCalc, insert, press } from '../calc.js';
import { $, money } from './dom.js';

let s = initialCalc();
let copiedTimer = null;

const KEYS = {
  Enter: '=', '=': '=', Backspace: 'back', Delete: 'clear', c: 'clear', C: 'clear',
  '+': '+', '-': '-', '*': '*', x: '*', X: '*', '/': '/', '.': '.', ',': '.', '%': '%',
};

function render() {
  const d = display(s);
  const text = d.error || d.result;
  $('cExpr').textContent = d.expr;
  const res = $('cRes');
  res.textContent = text;
  res.classList.toggle('err', !!d.error);
  res.style.fontSize = d.error ? '' : text.length > 15 ? '28px' : text.length > 11 ? '36px' : '';
  $('cClear').textContent = s.tokens.length ? 'C' : 'AC';
}

/** Quick-insert buttons for the active bucket's numbers. */
function renderChips() {
  const st = bucketStats(activeBucket());
  const list = [['Market', st.market], ['Offer', st.offer], ['Paid', st.paid]].filter(([, v]) => typeof v === 'number' && v > 0);
  $('cChips').innerHTML = list.map(([label, v]) => `<button type="button" class="cchip" data-v="${v}">${label} <b>${money(v)}</b></button>`).join('');
  $('cChips').hidden = !list.length;
}

export function openCalculator() {
  renderChips();
  render();
  $('calcDlg').showModal();
}

function apply(key) {
  s = press(s, key);
  render();
}

export function initCalculator() {
  $('cKeys').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b) apply(b.dataset.k);
  });
  $('cChips').addEventListener('click', (e) => {
    const b = e.target.closest('.cchip');
    if (!b) return;
    s = insert(s, Number(b.dataset.v));
    render();
  });
  // Tap the answer to copy it (the app's toasts sit under open dialogs, so say it here).
  $('cDisp').addEventListener('click', async () => {
    const d = display(s);
    if (d.error) return;
    let msg = 'Copied ✓';
    try { await navigator.clipboard.writeText(d.result.replace(/,/g, '')); } catch (e) { msg = "Couldn't copy"; }
    $('cExpr').textContent = msg;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(render, 1200);
  });
  $('calcDone').addEventListener('click', () => $('calcDlg').close());
  $('calcDlg').addEventListener('click', (e) => { if (e.target === $('calcDlg')) $('calcDlg').close(); });
  document.addEventListener('keydown', (e) => {
    if (!$('calcDlg').open || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = /^[0-9]$/.test(e.key) ? e.key : KEYS[e.key];
    if (!key) return;
    e.preventDefault();
    apply(key);
    const b = $('cKeys').querySelector(`button[data-k="${CSS.escape(key)}"]`);
    if (b) { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 120); }
  });
}
