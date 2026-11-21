// ui/sheets.js — the bottom sheets: fix a card ("Change"), confirm a searched card ("Pick"), and the buckets list.

import { app, activeBucket, bucketOf, findItem } from '../state.js';
import { saveSettings } from '../settings.js';
import { bucketStats, makeBucket } from '../buckets.js';
import { PRINTINGS, defaultPrinting, fmtNum, marketOf, printingFromFinish, printingKeys, tcgplayerSearchUrl } from '../cards.js';
import { PROVIDERS, getProvider, searchText } from '../providers/index.js';
import { readExport } from '../csv.js';
import { $, esc, money, fmtDate, toast, ask } from './dom.js';
import { removeItemEl, renderAll, renderItem, renderSummary } from './render.js';
import { isLive } from '../livePrices.js';

const sheet = { mode: null, id: null, results: null, msg: '', query: '', pick: null };
const provider = () => getProvider(app.settings.provider);

function candHtml(c, on) {
  const p = (c.prices || {})[defaultPrinting(c)] || {};
  return `<button class="cand${on ? ' on' : ''}" type="button" data-id="${esc(c.id)}">
    ${c.img ? `<img loading="lazy" alt="" src="${esc(c.img)}">` : '<img alt="">'}
    <span>${esc(c.name)}<br><small>${esc(c.setCode || c.setName)} · ${esc(fmtNum(c))}</small><br><em>${money(p.market)}</em></span>
  </button>`;
}
const searchFormHtml = (ph) => `<form class="s" id="bsSearch" autocomplete="off"><input id="bsQ" type="search" placeholder="${esc(ph)}" aria-label="Search cards"><button type="submit">Search</button></form>`;

function wireSearch(rerender, focus) {
  const input = $('bsQ');
  if (sheet.query) input.value = sheet.query;
  if (focus && !sheet.results) setTimeout(() => input.focus(), 60);
  $('bsSearch').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    Object.assign(sheet, { query: q, msg: 'Searching…', results: null });
    input.blur();
    rerender();
    try {
      sheet.results = await searchText(provider(), q, { key: app.settings.tcgKey });
      sheet.msg = sheet.results.length ? '' : `No cards found for “${q}”. Check the spelling or try just the name.`;
    } catch (err) {
      sheet.msg = err.message;
    }
    rerender();
  });
}

/* ---------- Change: fix the match or version of one card ---------- */

const timeOf = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Where this card's price comes from: live Near Mint, or the daily file. */
function priceSourceLine(c, printing) {
  const p = (c.prices || {})[printing] || {};
  if (p.live && c.liveAt) return `TCGplayer Near Mint market price · checked ${esc(timeOf(c.liveAt))}`;
  if (!c.updatedAt) return '';
  if (c.source !== 'tcgplayer') return `Prices updated ${esc(c.updatedAt)}`;
  return `TCGplayer daily market price · ${esc(c.updatedAt)}${app.live && app.live.enabled ? ' · not Near Mint–specific' : ''}`;
}
const dailyNote = (c, k) => (app.live && app.live.enabled && !((c.prices || {})[k] || {}).live ? ' · daily' : '');

function renderChange() {
  const found = findItem(sheet.id);
  if (!found) { $('bs').close(); return; }
  const { b, it } = found;
  const save = () => { app.storage.saveItem(b.id, it); renderItem(it); renderSummary(); };
  const ph = app.photos[it.id];
  $('bsTitle').textContent = it.status === 'review' ? 'Check this card' : 'Pick the right card';

  let html = '';
  if (it.card) {
    const c = it.card;
    html += `<div class="compare">
      ${ph ? `<img src="${esc(ph)}" alt="Your photo">` : ''}
      <img src="${esc(c.imgLarge || c.img)}" alt="">
      <div><div class="t">${esc(c.name)}</div><div class="s">${esc(c.setName)} · ${esc(fmtNum(c))}${c.rarity ? ' · ' + esc(c.rarity) : ''}</div>
      <div class="s">${priceSourceLine(c, it.printing)}</div>
      <a href="${esc(tcgplayerSearchUrl(c))}" target="_blank" rel="noopener">View on TCGplayer ›</a></div>
    </div>`;
    if (it.status === 'review') html += '<button class="confirm" type="button" id="confirmBtn">✓ This is the right card and version</button>';
    const keys = printingKeys(c);
    html += '<div class="sec">Version</div>';
    html += keys.length
      ? `<div class="chips">${keys.map((k) => `<button class="pchip${k === it.printing ? ' on' : ''}" type="button" data-p="${esc(k)}"><b>${money((c.prices[k] || {}).market)}</b><span>${esc(PRINTINGS[k] || k)}${dailyNote(c, k)}</span></button>`).join('')}</div>`
      : '<p class="note">No TCGplayer price on file for this card.</p>';
  } else {
    html += `<div class="compare">${ph ? `<img src="${esc(ph)}" alt="Your photo">` : ''}<div class="s">${esc(it.error || '')}${it.read ? '<br>Read: ' + esc(it.read) : ''}</div></div>`;
  }
  html += '<div class="sec">Search</div>' + searchFormHtml('Name and number, e.g. pikachu 25/198');
  const list = sheet.results || it.cands || [];
  html += `<div class="sec">${sheet.results ? 'Search results' : 'Other possible matches'}</div>`;
  if (sheet.msg) html += `<p class="note">${esc(sheet.msg)}</p>`;
  html += list.length
    ? `<div class="grid">${list.map((c) => candHtml(c, it.card && c.id === it.card.id)).join('')}</div>`
    : (sheet.msg ? '' : '<p class="note">Search above to find the card.</p>');
  const others = app.state.buckets.filter((x) => x.id !== b.id);
  if (others.length) {
    html += `<div class="sec">Move to another bucket</div><div class="row2"><select id="moveSel">${others.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select><button type="button" id="moveBtn">Move</button></div>`;
  }
  if (app.scanner.hasImage(it.id)) html += '<button class="plain" type="button" id="retryBtn">Scan this photo again</button>';
  html += '<button class="danger wide" type="button" id="removeBtn">Remove from bucket</button>';
  $('bsBody').innerHTML = html;

  if ($('confirmBtn')) $('confirmBtn').addEventListener('click', () => {
    Object.assign(it, { status: 'done', confirmed: true });
    save();
    $('bs').close();
  });
  $('bsBody').querySelectorAll('.pchip').forEach((el) => el.addEventListener('click', () => {
    if (it.model && el.dataset.p !== it.printing) it.corrected = true; // the scan had the wrong version
    Object.assign(it, { printing: el.dataset.p, status: 'done', confirmed: true });
    save();
    renderChange();
  }));
  $('bsBody').querySelectorAll('.cand').forEach((el) => el.addEventListener('click', () => {
    const c = list.find((x) => x.id === el.dataset.id);
    if (!c) return;
    const changed = !it.card || c.id !== it.card.id;
    if (it.model && changed) it.corrected = true; // the scan had the wrong card (or none)
    Object.assign(it, { card: c, status: 'done', confirmed: true, error: '' });
    if (changed) it.printing = printingFromFinish(c, it.finish, it.first);
    if (sheet.results) it.cands = sheet.results.slice(0, 12);
    Object.assign(sheet, { results: null, msg: '' });
    save();
    renderChange();
    $('bsBody').scrollTop = 0;
    if (changed && app.live) app.live.update([it]);
  }));
  if ($('moveBtn')) $('moveBtn').addEventListener('click', async () => {
    const to = bucketOf($('moveSel').value);
    if (!to) return;
    await app.storage.moveItem(b.id, to.id, it.id);
    renderAll();
    $('bs').close();
    toast(`Moved to ${to.name}`);
  });
  if ($('retryBtn')) $('retryBtn').addEventListener('click', () => {
    $('bs').close();
    app.scanner.retry(it);
  });
  $('removeBtn').addEventListener('click', () => {
    app.storage.deleteItem(b.id, it.id);
    delete app.photos[it.id];
    app.scanner.forget(it.id);
    removeItemEl(it.id);
    renderSummary();
    $('bs').close();
  });
  wireSearch(renderChange);
}

/* ---------- Pick: confirm a card found on the search screen, then add it ---------- */

/**
 * Opens the confirm sheet for a card tapped on the search screen. Nothing is priced until the
 * person confirms: then today's TCGplayer market price is pulled and the card goes into the bucket.
 * @param {object} card
 * @param {string} printing the version of the tile that was tapped
 * @param {(items:object[]) => void} [onAdded]
 */
export function openPick(card, printing, onAdded) {
  Object.assign(sheet, { mode: 'pick', id: null, results: null, msg: '', query: '', pick: { card, printing, qty: 1, onAdded, busy: false } });
  renderPick();
  $('bsDone').textContent = 'Cancel';
  if (!$('bs').open) $('bs').showModal();
  $('bsBody').scrollTop = 0;
}

function renderPick() {
  const pk = sheet.pick;
  const c = pk.card;
  const keys = printingKeys(c);
  $('bsTitle').textContent = 'Is this the card?';
  let html = `<div class="pick">
    <img class="pimg" src="${esc(c.imgLarge || c.img)}" alt="">
    <div class="t">${esc(c.name)}</div>
    <div class="s">${esc(c.setName)} · ${esc(fmtNum(c))}${c.rarity ? ' · ' + esc(c.rarity) : ''}</div>
  </div>`;
  html += '<div class="sec">Version</div>';
  html += keys.length
    ? `<div class="chips">${keys.map((k) => `<button class="vchip${k === pk.printing ? ' on' : ''}" type="button" data-p="${esc(k)}">${esc(PRINTINGS[k] || k)}</button>`).join('')}</div>`
    : '<p class="note">TCGplayer lists no versions for this card, so it will be added without a price.</p>';
  html += `<div class="sec">How many</div>
    <div class="qty"><button type="button" id="qMinus" aria-label="One less">−</button><b id="qVal">${pk.qty}</b><button type="button" id="qPlus" aria-label="One more">+</button></div>`;
  html += `<button class="addbtn" type="button" id="pickAdd"${pk.busy ? ' disabled' : ''}>${pk.busy ? 'Getting the price…' : `Add ${pk.qty > 1 ? pk.qty + ' ' : ''}to ${esc(activeBucket().name)}`}</button>`;
  html += `<a class="plink" href="${esc(tcgplayerSearchUrl(c))}" target="_blank" rel="noopener">View on TCGplayer ›</a>`;
  $('bsBody').innerHTML = html;

  $('bsBody').querySelectorAll('.vchip').forEach((el) => el.addEventListener('click', () => { pk.printing = el.dataset.p; renderPick(); }));
  $('qMinus').addEventListener('click', () => { pk.qty = Math.max(1, pk.qty - 1); renderPick(); });
  $('qPlus').addEventListener('click', () => { pk.qty = Math.min(99, pk.qty + 1); renderPick(); });
  $('pickAdd').addEventListener('click', () => addPicked(pk));
}

async function addPicked(pk) {
  if (pk.busy) return;
  pk.busy = true;
  renderPick();
  // Confirmed: pull today's market price for this exact card from its price source.
  let card = pk.card;
  try {
    const p = PROVIDERS[card.source];
    const [fresh] = p ? await p.getByIds([card.sourceId], { key: app.settings.tcgKey }) : [];
    if (fresh) card = fresh;
  } catch (e) { /* offline: use the copy already loaded */ }
  // ...and TCGplayer's Near Mint market price, live, when that's set up.
  if (app.live && app.live.enabled) {
    const probe = { status: 'done', card, printing: pk.printing };
    await app.live.price([probe], { fresh: true });
    card = probe.card;
  }
  const printing = (card.prices[pk.printing] || !printingKeys(card).length) ? pk.printing : defaultPrinting(card);
  const b = activeBucket();
  const now = new Date().toISOString();
  const added = [];
  for (let i = 0; i < pk.qty; i++) {
    const it = { id: crypto.randomUUID(), status: 'done', card, printing, confirmed: true, via: 'search', cands: [], addedAt: now };
    b.items.unshift(it);
    app.storage.saveItem(b.id, it);
    renderItem(it, true);
    added.push(it);
  }
  renderSummary();
  const version = PRINTINGS[printing] || printing;
  const kind = isLive(added[0]) ? ' Near Mint' : app.live && app.live.enabled ? ' (daily)' : '';
  toast(`Added ${pk.qty > 1 ? pk.qty + ' × ' : ''}${card.name}${version ? ' · ' + version : ''} · ${money(marketOf(added[0]))}${kind}${pk.qty > 1 ? ' each' : ''}`);
  if ($('bs').open) $('bs').close();
  if (pk.onAdded) pk.onAdded(added);
}

/* ---------- Buckets: switch, create, import ---------- */

function renderBuckets() {
  $('bsTitle').textContent = 'Buckets';
  let tMarket = 0;
  let tPaid = 0;
  let tCards = 0;
  const active = activeBucket().id;
  const rows = app.state.buckets.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((b) => {
    const s = bucketStats(b);
    tMarket += s.market;
    tCards += s.count;
    if (s.paid != null) tPaid += s.paid;
    return `<div class="brow" data-id="${esc(b.id)}">
      <div><div class="n">${esc(b.name)}${b.id === active ? '<em>Scanning</em>' : ''}</div>
      <div class="d">${fmtDate(b.createdAt)} · ${s.count} card${s.count === 1 ? '' : 's'}${s.review + s.failed ? ` · ${s.review + s.failed} to review` : ''}</div></div>
      <div class="v"><b>${money(s.market)}</b><span>${s.paid != null ? 'Paid ' + money(s.paid) : `Offer ${money(s.offer)}`}</span></div>
    </div>`;
  }).join('');
  $('bsBody').innerHTML = `
    <div class="btop">
      <button class="pri" type="button" id="newBucket">+ New bucket</button>
      <label>Import CSV<input type="file" accept=".csv,text/csv" id="importInput"></label>
    </div>
    <div class="grand"><span>${app.state.buckets.length} buckets · <b>${tCards}</b> cards</span><span>Market <b>${money(tMarket)}</b></span><span>Paid <b>${money(tPaid)}</b></span></div>
    <div style="margin-top:8px">${rows}</div>`;
  $('bsBody').querySelectorAll('.brow').forEach((el) => el.addEventListener('click', () => {
    switchBucket(el.dataset.id);
    $('bs').close();
  }));
  $('newBucket').addEventListener('click', async () => {
    const draft = makeBucket({ offerPct: app.settings.defaultPct });
    const name = await ask({ title: 'New bucket', text: 'Name it after the lot, seller or container.', input: draft.name, okLabel: 'Create' });
    if (name === null) return;
    draft.name = name || draft.name;
    await app.storage.saveBucket(draft);
    switchBucket(draft.id);
    $('bs').close();
    toast(`Scanning into ${draft.name}`);
  });
  $('importInput').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) importCsv(f);
  });
}

export function switchBucket(id) {
  saveSettings(app.settings, { activeBucket: id });
  app.filter = 'all';
  renderAll();
}

/** Rebuilds a bucket from an exported CSV, refetching each card so prices are today's. */
async function importCsv(file) {
  try {
    const data = readExport(await file.text());
    toast('Importing…');
    const bySource = {};
    for (const e of data.entries) (bySource[e.source] ||= []).push(e.sourceId);
    const cards = {};
    for (const [source, ids] of Object.entries(bySource)) {
      const p = PROVIDERS[source];
      if (!p) continue;
      for (const c of await p.getByIds(ids, { key: app.settings.tcgKey })) cards[c.id] = c;
    }
    const b = makeBucket({ name: `${data.name} (imported)`, offerPct: data.offerPct ?? app.settings.defaultPct });
    if (data.paid != null) b.paid = data.paid;
    let missing = 0;
    for (const e of data.entries) {
      const c = cards[`${e.source}:${e.sourceId}`];
      if (!c) { missing++; continue; }
      b.items.unshift({ id: crypto.randomUUID(), status: 'done', card: c, printing: c.prices[e.printing] ? e.printing : defaultPrinting(c), confirmed: true, cands: [], addedAt: new Date().toISOString() });
    }
    await app.storage.saveBucket(b);
    switchBucket(b.id);
    $('bs').close();
    if (app.live) app.live.update(b.items, { fresh: true });
    toast(`Imported ${b.items.length} cards${missing ? ` (${missing} not found)` : ''} with today’s prices`);
  } catch (e) {
    toast(e.message || 'Import failed');
  }
}

export function openSheet(mode, id) {
  Object.assign(sheet, { mode, id: id || null, results: null, msg: '', query: '', pick: null });
  $('bsDone').textContent = 'Done';
  if (mode === 'change') renderChange();
  else renderBuckets();
  if (!$('bs').open) $('bs').showModal();
  $('bsBody').scrollTop = 0;
}

/** Called by the scan pipeline so an open Change sheet shows the finished result. */
export function refreshOpenChange(id) {
  if (sheet.mode === 'change' && sheet.id === id && $('bs').open) renderChange();
}
