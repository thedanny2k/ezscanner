// ui/search.js — the full-screen card search (Collectr style).
// Type "charizard 14" and every matching card shows as a tile, one tile per version. Tiles show
// no prices: tap the right one, confirm it, and the TCGplayer market price is pulled as the card
// goes into the bucket (see openPick in sheets.js).

import { app, activeBucket } from '../state.js';
import { getProvider, searchText } from '../providers/index.js';
import { PRINTINGS, fmtNum, printingKeys } from '../cards.js';
import { SORTS, pushRecent } from '../search.js';
import { $, esc } from './dom.js';
import { openPick } from './sheets.js';

const RECENT_KEY = 'ezscanner.recentSearches';
const PAGE = 40;
const ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/></svg>';

const st = { open: false, q: '', cards: [], total: 0, tiles: [], shown: 0, sort: 'best', seq: 0, loading: false, msg: '', focused: false, info: null };
let timer = null;
let observer = null;

const provider = () => getProvider(app.settings.provider);
const isLocal = () => typeof provider().search === 'function';

/* ---------- recent searches (this phone only) ---------- */

function loadRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch (e) {
    return [];
  }
}
function saveRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
}
const remember = (q) => saveRecent(pushRecent(loadRecent(), q));

function renderRecent() {
  const typed = $('sQ').value.trim().toLowerCase();
  const list = loadRecent().filter((r) => !typed || (r.toLowerCase().startsWith(typed) && r.toLowerCase() !== typed));
  const box = $('sRecent');
  box.hidden = !(st.focused && list.length);
  if (box.hidden) return;
  box.innerHTML = list.map((r) => `<div class="rrow"><button type="button" class="rq" data-q="${esc(r)}">${ICON_CLOCK}<span>${esc(r)}</span></button>` +
    `<button type="button" class="rx" data-x="${esc(r)}" aria-label="Remove ${esc(r)} from recent searches">×</button></div>`).join('');
}

/* ---------- results ---------- */

/** One tile per card version, like Collectr. */
function expand(cards) {
  const tiles = [];
  for (const c of cards) {
    const keys = printingKeys(c);
    if (!keys.length) tiles.push({ c, p: '' });
    for (const p of keys) tiles.push({ c, p });
  }
  return tiles;
}

/** How many of each card + version are already in the active bucket. */
function qtyMap() {
  const m = new Map();
  for (const it of activeBucket().items) {
    if (!it.card || it.status === 'failed') continue;
    const k = `${it.card.id}|${it.printing || ''}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

const qtyText = (n) => `In bucket: ${n}`;

function tileHtml(t, i, qty) {
  const c = t.c;
  const n = qty.get(`${c.id}|${t.p}`) || 0;
  const line2 = [c.rarity, fmtNum(c)].filter(Boolean).join(' • ');
  return `<button class="tile" type="button" data-i="${i}">
    <span class="timg">${c.img ? `<img loading="lazy" decoding="async" alt="" src="${esc(c.img)}">` : ''}</span>
    <span class="tname">${esc(c.name)}</span>
    <span class="tset">${esc(c.setName)}</span>
    <span class="tset">${esc(line2)}</span>
    <span class="tver">${esc(t.p ? PRINTINGS[t.p] || t.p : 'No version listed')}</span>
    <span class="tfoot"><span class="tqty${n ? ' has' : ''}">${qtyText(n)}</span><span class="tplus" aria-hidden="true">+</span></span>
  </button>`;
}

function renderMore() {
  if (st.shown >= st.tiles.length) return;
  const qty = qtyMap();
  const next = st.tiles.slice(st.shown, st.shown + PAGE);
  $('sGrid').insertAdjacentHTML('beforeend', next.map((t, j) => tileHtml(t, st.shown + j, qty)).join(''));
  st.shown += next.length;
}

function renderStatus() {
  const bucket = `Adding to <b>${esc(activeBucket().name)}</b>`;
  const info = st.info;
  const warn = info && info.partial
    ? `<div class="swarn">Test price file: only the ${info.partial.limit} newest sets are loaded, so most cards are missing. Run <b>npm run prices</b> for every set.</div>`
    : '';
  let html;
  if (st.loading) html = isLocal() && !st.cards.length ? 'Loading TCGplayer cards…' : 'Searching…';
  else if (st.msg) html = esc(st.msg);
  else if (!st.q.trim()) {
    const loaded = info ? `<br>TCGplayer data: ${info.sets.toLocaleString('en-US')} sets · ${info.cards.toLocaleString('en-US')} cards · prices from ${esc(info.updated)}` : '';
    html = `Search by name, number or set: <i>charizard 14</i>, <i>pikachu 25/198</i>, <i>celebi skyridge</i>.<br>${bucket}${loaded}`;
  } else {
    const more = st.total > st.cards.length ? ` (showing ${st.cards.length} of ${st.total}; add a number or set to narrow it)` : '';
    html = `${st.cards.length} card${st.cards.length === 1 ? '' : 's'}${more} · ${bucket}`;
  }
  $('sStatus').innerHTML = warn + html;
  $('sSortBtn').classList.toggle('on', st.sort !== 'best');
}

function renderResults() {
  $('sGrid').innerHTML = '';
  st.shown = 0;
  renderMore();
  renderStatus();
  $('sRes').scrollTop = 0;
}

/** Updates the "In bucket" counts after cards are added, without redrawing the grid. */
function refreshQty() {
  const qty = qtyMap();
  $('sGrid').querySelectorAll('.tile').forEach((el) => {
    const t = st.tiles[Number(el.dataset.i)];
    if (!t) return;
    const n = qty.get(`${t.c.id}|${t.p}`) || 0;
    const q = el.querySelector('.tqty');
    q.textContent = qtyText(n);
    q.classList.toggle('has', n > 0);
  });
}

async function run(q, { commit = false } = {}) {
  st.q = q;
  const seq = ++st.seq;
  $('sClear').hidden = !q;
  if (!q.trim()) {
    Object.assign(st, { cards: [], total: 0, tiles: [], msg: '', loading: false });
    renderResults();
    return;
  }
  st.loading = true;
  renderStatus();
  try {
    const cards = await searchText(provider(), q, { key: app.settings.tcgKey, sort: st.sort });
    if (seq !== st.seq) return; // a newer search started while this one ran
    Object.assign(st, { cards, total: cards.total || cards.length, tiles: expand(cards), msg: cards.length ? '' : `No cards match “${q.trim()}”. Check the spelling, or try fewer words.` });
  } catch (e) {
    if (seq !== st.seq) return;
    Object.assign(st, { cards: [], total: 0, tiles: [], msg: e.message || 'Search failed.' });
  }
  st.loading = false;
  renderResults();
  if (commit) remember(q.trim());
}

/* ---------- open / close ---------- */

export function openSearch() {
  st.open = true;
  $('searchView').hidden = false;
  renderStatus();
  refreshQty();
  const p = provider();
  if (p.info) p.info().then((i) => { st.info = i; if (st.open) renderStatus(); }).catch(() => {});
  else st.info = null;
  if (!st.q) setTimeout(() => $('sQ').focus(), 60);
}

export function closeSearch() {
  st.open = false;
  $('sQ').blur();
  $('sSort').hidden = true;
  $('searchView').hidden = true;
}

export const isSearchOpen = () => st.open;

function openTile(i) {
  const t = st.tiles[i];
  if (!t) return;
  if (st.q.trim()) remember(st.q.trim());
  $('sQ').blur();
  openPick(t.c, t.p, refreshQty);
}

export function initSearch() {
  const input = $('sQ');
  $('sCam').addEventListener('click', closeSearch);
  $('sForm').addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    input.blur();
    run(input.value, { commit: true });
  });
  input.addEventListener('input', () => {
    $('sClear').hidden = !input.value;
    renderRecent();
    clearTimeout(timer);
    // The TCGplayer price file is searched in memory, so results follow the typing. Online
    // providers only search when you press Search, to stay inside their rate limits.
    if (isLocal()) timer = setTimeout(() => run(input.value), 120);
  });
  input.addEventListener('focus', () => { st.focused = true; $('sSort').hidden = true; renderRecent(); });
  input.addEventListener('blur', () => { st.focused = false; renderRecent(); });
  $('sClear').addEventListener('click', () => {
    input.value = '';
    run('');
    input.focus();
  });

  // Recent searches: pointerdown keeps the input focused so the tap lands.
  $('sRecent').addEventListener('pointerdown', (e) => e.preventDefault());
  $('sRecent').addEventListener('click', (e) => {
    const x = e.target.closest('.rx');
    if (x) {
      saveRecent(loadRecent().filter((r) => r !== x.dataset.x));
      renderRecent();
      return;
    }
    const q = e.target.closest('.rq');
    if (!q) return;
    input.value = q.dataset.q;
    input.blur();
    run(q.dataset.q, { commit: true });
  });

  $('sSortBtn').addEventListener('click', () => {
    const box = $('sSort');
    box.innerHTML = Object.entries(SORTS).map(([k, label]) => `<button type="button" data-s="${k}" class="${k === st.sort ? 'on' : ''}">${esc(label)}</button>`).join('');
    box.hidden = !box.hidden;
  });
  $('sSort').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-s]');
    if (!b) return;
    st.sort = b.dataset.s;
    $('sSort').hidden = true;
    run(st.q);
  });

  $('sGrid').addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (tile) openTile(Number(tile.dataset.i));
  });
  $('sRes').addEventListener('scroll', () => {
    if (st.focused) input.blur();
    $('sSort').hidden = true;
  }, { passive: true });

  // Load the next page of tiles when the end of the list scrolls into view.
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) renderMore(); }, { root: $('sRes'), rootMargin: '600px' });
    observer.observe($('sMore'));
  } else {
    $('sRes').addEventListener('scroll', () => {
      const r = $('sRes');
      if (r.scrollTop + r.clientHeight > r.scrollHeight - 800) renderMore();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && st.open && !document.querySelector('dialog[open]')) closeSearch();
  });
}
