// ui/render.js — draws the bucket: the list of scanned cards, totals and the calculator fields.

import { app, activeBucket, findItem } from '../state.js';
import { bucketStats, itemOffer } from '../buckets.js';
import { PRINTINGS, fmtNum, marketOf } from '../cards.js';
import { $, esc, money, num2, pctFmt, fmtDate, ICON_CHANGE, ICON_SEARCH } from './dom.js';
import { isLive } from '../livePrices.js';

/** "daily" next to a price that isn't TCGplayer's live Near Mint number (only when live prices are set up). */
const dailyTag = (it) => (app.live && app.live.enabled && typeof marketOf(it) === 'number' && !isLive(it)
  ? '<span class="ptag" title="TCGplayer daily price, not Near Mint–specific">daily</span>' : '');

const needsAttention = (it) => it.status === 'review' || it.status === 'failed';
const visible = (b) => (app.filter === 'review' ? b.items.filter(needsAttention) : b.items);

function confHtml(it) {
  if (it.confirmed) return '<span class="conf g">✓ Confirmed</span>';
  if (typeof it.confidence !== 'number') return '';
  const cls = it.confidence >= 85 ? 'g' : it.confidence >= 60 ? 'a' : 'r';
  return `<span class="conf ${cls}">${it.confidence}%${it.verified ? ' ✓✓' : ''}</span>`;
}

function offerHtml(b, it) {
  const m = marketOf(it);
  if (typeof m !== 'number') return '';
  if (it.status === 'review') return 'Not counted yet';
  if (m < (b.minValue || 0)) return 'Skipped (under min)';
  return `Offer <b>${money(itemOffer(b, it))}</b>`;
}

function itemHtml(b, it) {
  const ph = app.photos[it.id];
  const shot = ph ? `<img src="${esc(ph)}" alt="Your photo">` : `<div class="ph">${ICON_SEARCH}</div>`;
  let match;
  let title;
  let sub;
  let extra = '';
  let meta;
  if (it.status === 'reading' || it.status === 'lookup') {
    match = '<div class="ph"><div class="spin"></div></div>';
    title = it.status === 'reading' ? 'Identifying card…' : 'Finding price…';
    sub = esc(it.read || 'Hang on a second');
    meta = '';
  } else if (it.status === 'failed' || !it.card) {
    match = '<div class="ph">?</div>';
    title = "Couldn't identify";
    sub = esc(it.error || 'Tap to search for it');
    meta = `<button class="change" type="button">${ICON_SEARCH} Fix</button>`;
  } else {
    const c = it.card;
    match = c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}" loading="lazy">` : '<div class="ph">?</div>';
    title = `${esc(c.name)} – ${esc(fmtNum(c))}`;
    sub = `${esc(c.setCode || c.setName)} · ${esc(c.setName)} · ${esc(PRINTINGS[it.printing] || it.printing || 'No price')}`;
    extra = `<div class="prow"><span class="pill">${money(marketOf(it))}</span>${dailyTag(it)}<span class="ioffer">${offerHtml(b, it)}</span></div>`;
    meta = it.status === 'review'
      ? `<span class="tag">Needs review</span>${confHtml(it)}`
      : `<button class="change" type="button">${ICON_CHANGE} Change</button>${confHtml(it)}`;
  }
  return `<div class="item st-${esc(it.status)}" data-id="${esc(it.id)}">
    <div class="thumbs">${shot}${match}</div>
    <div class="info"><div class="title">${title}</div><div class="sub">${sub}</div>${extra}</div>
    <div class="meta2">${meta}</div>
  </div>`;
}

const itemEl = (id) => $('items').querySelector(`.item[data-id="${CSS.escape(id)}"]`);

/** Redraws one card row in place (or adds it at the top). */
export function renderItem(it, prepend) {
  const found = findItem(it.id);
  if (!found || found.b.id !== activeBucket().id) return;
  const el = itemEl(it.id);
  if (app.filter === 'review' && !needsAttention(it)) {
    if (el) el.remove();
    if (!$('items').children.length) renderItems();
    return;
  }
  const html = itemHtml(found.b, it);
  if (el) { el.outerHTML = html; return; }
  const empty = $('items').querySelector('.empty');
  if (empty) empty.remove();
  $('items').insertAdjacentHTML(prepend ? 'afterbegin' : 'beforeend', html);
}

export function removeItemEl(id) {
  const el = itemEl(id);
  if (el) el.remove();
  if (!$('items').children.length) renderItems();
}

export function renderItems() {
  const b = activeBucket();
  const list = visible(b);
  const emptyText = app.filter === 'review'
    ? 'Nothing needs review. Nice.'
    : 'Line up a card inside the frame and tap to scan.<br>Cards you scan go into this bucket.';
  $('items').innerHTML = list.length ? list.map((it) => itemHtml(b, it)).join('') : `<div class="empty">${emptyText}</div>`;
}

export function refreshItemOffers() {
  const b = activeBucket();
  $('items').querySelectorAll('.item').forEach((el) => {
    const it = b.items.find((x) => x.id === el.dataset.id);
    const span = el.querySelector('.ioffer');
    if (it && span) span.innerHTML = offerHtml(b, it);
  });
}

/** Totals, offer line, review bar and calculator fields. `skip` names the field being typed in. */
export function renderSummary(skip) {
  const b = activeBucket();
  const s = bucketStats(b);
  const focused = document.activeElement;
  $('bucketLabel').textContent = b.name;
  $('sum').innerHTML = `${s.count}<span class="sep">•</span><em>${money(s.market)}</em>`;
  $('offerLine').innerHTML = `<span class="o">Offer ${pctFmt(s.pct)}% · <b>${money(s.offer)}</b></span><span>${s.paid != null ? `Paid <b>${money(s.paid)}</b>` : 'Tap for offer calculator'}</span>`;

  const attention = s.review + s.failed;
  if (!attention && app.filter === 'review') { app.filter = 'all'; renderItems(); }
  const bar = $('reviewBar');
  bar.hidden = !attention;
  bar.classList.toggle('on', app.filter === 'review');
  bar.innerHTML = app.filter === 'review'
    ? `<span>Showing ${attention} to review</span><span>Show all</span>`
    : `<span>⚠ ${attention} card${attention === 1 ? '' : 's'} need${attention === 1 ? 's' : ''} review${s.reviewValue ? ` · ${money(s.reviewValue)} not counted` : ''}</span><span>Show</span>`;

  $('stMarket').textContent = money(s.market);
  $('stCount').textContent = `${s.count} card${s.count === 1 ? '' : 's'}${s.pending ? ` · ${s.pending} scanning` : ''}`;
  $('stPaidPct').textContent = s.paidPct != null ? `${s.paidPct.toFixed(1)}% of market` : 'tap to enter';
  const pr = $('stProfit');
  pr.textContent = s.profit != null ? money(s.profit) : '—';
  pr.className = s.profit == null ? '' : s.profit >= 0 ? 'pos' : 'neg';
  $('stMargin').textContent = s.profit != null && s.market ? `${((s.profit / s.market) * 100).toFixed(1)}% of market` : 'enter what you paid';

  if (skip !== 'pct' && focused !== $('pctInput')) $('pctInput').value = pctFmt(s.pct);
  $('pctRange').value = Math.round(s.pct);
  if (skip !== 'offer' && focused !== $('offerInput')) $('offerInput').value = num2(s.offer);
  if (skip !== 'min' && focused !== $('minInput')) $('minInput').value = b.minValue ? String(b.minValue) : '';
  if (skip !== 'paid' && focused !== $('paidInput')) $('paidInput').value = s.paid != null ? num2(s.paid) : '';
  $('minInfo').textContent = s.under ? `${s.under} skipped (${money(s.underValue)})` : '';
  $('eligInfo').textContent = s.eligible !== s.market ? `on ${money(s.eligible)}` : '';
  $('presets').querySelectorAll('button').forEach((btn) => btn.classList.toggle('on', Number(btn.dataset.p) === s.pct));
  app.hooks.updateChip();
}

export function renderBucketPanel() {
  const b = activeBucket();
  $('bName').value = b.name;
  $('bDate').textContent = `Started ${fmtDate(b.createdAt)}`;
  $('notes').value = b.notes || '';
}

export function renderAll() {
  renderBucketPanel();
  renderItems();
  renderSummary();
}
