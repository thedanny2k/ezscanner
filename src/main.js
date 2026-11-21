// main.js — starts the app and wires the scanner screen: camera, tap to scan, bucket panel.

import { app, activeBucket, allItems, findItem } from './state.js';
import { saveSettings } from './settings.js';
import { createStorage } from './storage/index.js';
import { createScanner } from './scan.js';
import { createAi, directTransport, modelShortName } from './recognize/ai.js';
import { getWorker, readCard } from './recognize/ocr.js';
import { PROVIDERS, getProvider } from './providers/index.js';
import { bucketStats, makeBucket, pctForOffer } from './buckets.js';
import { defaultPrinting } from './cards.js';
import { bucketToCsv } from './csv.js';
import { grabFrame, startCamera, stopCamera, thumbUrl } from './camera.js';
import { $, ask, clamp, money, parseMoney, toast } from './ui/dom.js';
import { refreshItemOffers, renderAll, renderItem, renderItems, renderSummary } from './ui/render.js';
import { openSheet, refreshOpenChange, switchBucket } from './ui/sheets.js';
import { initSettings } from './ui/settings.js';
import { initSearch, openSearch } from './ui/search.js';
import { LIVE_PRICES_URL } from './config.js';
import { createLiveClient, isLive, refreshItemsLive } from './livePrices.js';

const PRESETS = [50, 60, 65, 70, 75, 80, 85, 90];
const cam = { on: false, track: null, torchOn: false, lastTap: 0 };
let ocrReady = false;
let warnedCheckSkipped = false;

/* ---------- live Near Mint prices (docs/decisions/0008) ---------- */

const liveClient = createLiveClient({ url: LIVE_PRICES_URL });
let liveWarnedAt = 0;
const liveQueue = new Set();
let liveTimer = null;

app.live = {
  get enabled() { return liveClient.enabled; },
  /** Prices items live without saving or drawing (e.g. a card about to be added). */
  async price(items, opts) {
    try {
      return { changed: await refreshItemsLive(items, liveClient, opts) };
    } catch (e) {
      return { changed: [], error: e.message };
    }
  },
  /** Prices bucket items live, then saves and redraws the ones that changed. */
  async update(items, opts) {
    const r = await app.live.price(items, opts);
    for (const it of r.changed) {
      const found = findItem(it.id);
      if (!found) continue;
      app.storage.saveItem(found.b.id, it);
      renderItem(it);
      refreshOpenChange(it.id);
    }
    if (r.changed.length) renderSummary();
    if (r.error && Date.now() - liveWarnedAt > 60000) {
      liveWarnedAt = Date.now();
      toast(`${r.error} Showing daily prices for now.`);
    }
    return r;
  },
  /** Scans finish one by one; price them together a moment later. */
  queue(item) {
    if (!liveClient.enabled) return;
    liveQueue.add(item);
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      const items = [...liveQueue];
      liveQueue.clear();
      app.live.update(items);
    }, 300);
  },
};

/* ---------- AI + scan pipeline ---------- */

const ai = createAi(directTransport(() => app.settings.aiKey));
const getAi = () => (app.settings.aiKey ? ai : null);

app.scanner = createScanner({
  getAi,
  ocr: readCard,
  getProvider: () => getProvider(app.settings.provider),
  getSettings: () => app.settings,
  onChange(item, finished) {
    const found = findItem(item.id);
    if (!found) return; // removed while scanning
    if (finished) app.storage.saveItem(found.b.id, item);
    renderItem(item);
    renderSummary();
    if (finished) refreshOpenChange(item.id);
    if (finished && item.card && item.status !== 'failed') app.live.queue(item);
    if (finished && item.checkSkipped && !warnedCheckSkipped) {
      warnedCheckSkipped = true;
      toast('Double-check skipped: the AI couldn’t load TCGplayer’s card images. Matching by text only.');
    }
  },
});

function warmTextReader() {
  if (getAi() || ocrReady) return;
  getWorker().then(() => { ocrReady = true; updateChip(); }).catch(() => updateChip());
}

function addScan(canvas) {
  const b = activeBucket();
  const item = { id: crypto.randomUUID(), status: 'reading', addedAt: new Date().toISOString() };
  const thumb = thumbUrl(canvas);
  app.photos[item.id] = thumb;
  app.storage.savePhoto(item.id, thumb);
  b.items.unshift(item);
  if (app.filter === 'review') { app.filter = 'all'; renderItems(); } else renderItem(item, true);
  $('list').scrollTop = 0;
  app.scanner.enqueue(item, canvas);
}

/* ---------- camera ---------- */

function showCamError(msg) {
  $('camErrText').textContent = msg;
  $('camErr').hidden = false;
  updateChip();
}

async function openCamera() {
  try {
    const { track, torch } = await startCamera($('video'));
    Object.assign(cam, { on: true, track, torchOn: false });
    $('camErr').hidden = true;
    $('torchBtn').hidden = !torch;
    $('torchBtn').classList.remove('on');
    layoutGuide();
  } catch (e) {
    cam.on = false;
    showCamError(e && e.name === 'NotAllowedError' ? 'Camera access is blocked. Allow camera access for this site, then tap Try again.'
      : e && e.name === 'NotFoundError' ? 'No camera found. You can still scan from a photo (top right) or search.'
      : `${e.message || "Couldn't start the camera."} You can still scan from a photo (top right) or search.`);
  }
  updateChip();
}

function layoutGuide() {
  const g = $('guide');
  const w = $('cam').clientWidth;
  const h = $('cam').clientHeight;
  const topPad = 46;
  const availH = h - topPad - 34;
  if (availH < 120) { g.hidden = true; $('tapHint').hidden = true; return; }
  g.hidden = false;
  $('tapHint').hidden = !!app.settings.tapTipSeen;
  const gh = Math.min(availH, (w * 0.84 * 88) / 63);
  const gw = (gh * 63) / 88;
  Object.assign(g.style, { width: gw + 'px', height: gh + 'px', left: (w - gw) / 2 + 'px', top: topPad + (availH - gh) / 2 + 'px' });
}

function capture() {
  const now = Date.now();
  if (now - cam.lastTap < 450) return;
  cam.lastTap = now;
  const canvas = grabFrame($('video'), $('cam'), $('guide'));
  if (!canvas) return;
  const f = $('flash');
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
  if (!app.settings.tapTipSeen) { saveSettings(app.settings, { tapTipSeen: true }); $('tapHint').hidden = true; }
  addScan(canvas);
}

function updateChip() {
  const pending = allItems().filter((it) => it.status === 'reading' || it.status === 'lookup').length;
  const useAi = !!getAi();
  let text;
  let ok = false;
  if (!$('camErr').hidden) text = 'Camera off';
  else if (!cam.on) text = 'Starting camera…';
  else if (!useAi && !ocrReady) text = pending ? `Getting reader ready · ${pending} waiting` : 'Getting text reader ready…';
  else if (pending) text = `Identifying ${pending} card${pending > 1 ? 's' : ''}…`;
  else { text = `Ready · ${useAi ? modelShortName(app.settings.model) : 'text reader'} · tap to scan`; ok = true; }
  $('chipText').textContent = text;
  $('chipDot').classList.toggle('ok', ok);
}
app.hooks.updateChip = updateChip;

/* ---------- bucket actions ---------- */

const saveBucket = () => app.storage.saveBucket(activeBucket());

function setPct(v, skip) {
  activeBucket().offerPct = clamp(Math.round(v * 10) / 10, 0, 100);
  saveBucket();
  renderSummary(skip);
  refreshItemOffers();
}

async function shareCsv() {
  const b = activeBucket();
  const csv = bucketToCsv(b);
  const fname = (b.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'bucket') + '.csv';
  try {
    const file = new File([csv], fname, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: b.name }); return; }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Refetches every card in the bucket from the provider it came from. */
async function refreshPrices() {
  const b = activeBucket();
  const bySource = {};
  for (const it of b.items) if (it.card) (bySource[it.card.source] ||= []).push(it.card.sourceId);
  if (!Object.keys(bySource).length) return;
  $('refreshBtn').textContent = 'Updating…';
  const before = new Map(b.items.map((it) => [it.id, it.card && it.card.prices]));
  try {
    const fresh = {};
    for (const [source, ids] of Object.entries(bySource)) {
      if (!PROVIDERS[source]) continue;
      for (const c of await PROVIDERS[source].getByIds(ids, { key: app.settings.tcgKey })) fresh[c.id] = c;
    }
    for (const it of b.items) {
      const c = it.card && fresh[it.card.id];
      if (!c) continue;
      Object.assign(it.card, { prices: c.prices, updatedAt: c.updatedAt });
      if (!c.prices[it.printing]) it.printing = defaultPrinting(c);
    }
    let note = '';
    if (app.live.enabled) {
      const r = await app.live.price(b.items, { fresh: true });
      if (r.error) {
        // Couldn't reach TCGplayer: keep the Near Mint prices from earlier rather than drop to daily ones.
        for (const it of b.items) {
          for (const [k, p] of Object.entries(before.get(it.id) || {})) if (p && p.live && it.card) it.card.prices[k] = p;
        }
      }
      const live = b.items.filter(isLive).length;
      note = r.error ? ` (${r.error} Kept earlier Near Mint prices.)` : ` · ${live} Near Mint live`;
    }
    saveBucket();
    renderItems();
    renderSummary();
    toast(`Prices updated${note}`);
  } catch (e) {
    toast(e.message);
  }
  $('refreshBtn').textContent = 'Update prices';
}

async function deleteBucket() {
  const b = activeBucket();
  const ok = await ask({ title: `Delete “${b.name}”?`, text: `This removes the bucket and its ${b.items.length} cards from this phone. Share the CSV first if you need a copy.`, okLabel: 'Delete', danger: true });
  if (!ok) return;
  for (const it of b.items) { delete app.photos[it.id]; app.scanner.forget(it.id); }
  await app.storage.deleteBucket(b.id);
  if (!app.state.buckets.length) await app.storage.saveBucket(makeBucket({ offerPct: app.settings.defaultPct }));
  switchBucket(app.state.buckets[app.state.buckets.length - 1].id);
  toggleSheet(false);
  toast('Bucket deleted');
}

/* ---------- wiring ---------- */

function toggleSheet(force) {
  const on = typeof force === 'boolean' ? force : !$('app').classList.contains('expanded');
  $('app').classList.toggle('expanded', on);
  $('chevBtn').setAttribute('aria-label', on ? 'Back to camera' : 'Open bucket details');
  if (on) $('list').scrollTop = 0;
}

function wire() {
  $('cam').addEventListener('click', (e) => {
    if (e.target.closest('#camRetry')) return;
    if ($('app').classList.contains('expanded')) { toggleSheet(false); return; }
    if ($('camErr').hidden) capture();
  });
  $('camRetry').addEventListener('click', (e) => { e.stopPropagation(); openCamera(); });
  $('chevBtn').addEventListener('click', () => toggleSheet());
  $('calcBtn').addEventListener('click', () => toggleSheet(true));
  $('offerLine').addEventListener('click', () => toggleSheet(true));
  $('sheet').addEventListener('transitionend', layoutGuide);
  $('reviewBar').addEventListener('click', () => {
    app.filter = app.filter === 'review' ? 'all' : 'review';
    renderItems();
    renderSummary();
  });
  $('items').addEventListener('click', (e) => {
    const el = e.target.closest('.item');
    const found = el && findItem(el.dataset.id);
    if (found && found.it.status !== 'reading' && found.it.status !== 'lookup') openSheet('change', el.dataset.id);
  });
  $('searchBtn').addEventListener('click', openSearch);
  $('bucketBtn').addEventListener('click', () => openSheet('buckets'));
  $('bsDone').addEventListener('click', () => $('bs').close());
  $('bs').addEventListener('click', (e) => { if (e.target === $('bs')) $('bs').close(); });

  // offer calculator
  $('presets').innerHTML = PRESETS.map((p) => `<button type="button" data-p="${p}">${p}</button>`).join('');
  $('presets').addEventListener('click', (e) => { const btn = e.target.closest('button'); if (btn) setPct(Number(btn.dataset.p)); });
  $('pctRange').addEventListener('input', () => setPct(Number($('pctRange').value)));
  $('pctInput').addEventListener('input', () => { const v = parseMoney($('pctInput').value); if (v != null) setPct(v, 'pct'); });
  $('offerInput').addEventListener('input', () => {
    const v = parseMoney($('offerInput').value);
    if (v != null && bucketStats(activeBucket()).eligible > 0) setPct(pctForOffer(activeBucket(), v), 'offer');
  });
  $('minInput').addEventListener('input', () => {
    activeBucket().minValue = Math.max(0, parseMoney($('minInput').value) || 0);
    saveBucket();
    renderSummary('min');
    refreshItemOffers();
  });
  $('paidInput').addEventListener('input', () => { activeBucket().paid = parseMoney($('paidInput').value); saveBucket(); renderSummary('paid'); });
  for (const id of ['pctInput', 'offerInput', 'paidInput', 'minInput']) $(id).addEventListener('blur', () => setTimeout(renderSummary, 0));
  $('usePaid').addEventListener('click', () => {
    const b = activeBucket();
    b.paid = Math.round(bucketStats(b).offer * 100) / 100;
    saveBucket();
    renderSummary();
    toast(`Paid set to ${money(b.paid)}`);
  });
  $('bName').addEventListener('input', () => {
    const b = activeBucket();
    b.name = $('bName').value.trim() || b.name;
    $('bucketLabel').textContent = b.name;
    saveBucket();
  });
  $('notes').addEventListener('input', () => { activeBucket().notes = $('notes').value; saveBucket(); });
  $('refreshBtn').addEventListener('click', refreshPrices);
  $('shareBtn').addEventListener('click', shareCsv);
  $('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(bucketToCsv(activeBucket())); toast('CSV copied'); } catch (e) { toast("Couldn't copy. Use Share CSV instead."); }
  });
  $('delBucketBtn').addEventListener('click', deleteBucket);

  $('torchBtn').addEventListener('click', async () => {
    if (!cam.track) return;
    try {
      await cam.track.applyConstraints({ advanced: [{ torch: !cam.torchOn }] });
      cam.torchOn = !cam.torchOn;
      $('torchBtn').classList.toggle('on', cam.torchOn);
    } catch (e) {
      $('torchBtn').hidden = true;
    }
  });

  $('fileInput').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const s = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      addScan(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast("Couldn't open that photo"); };
    img.src = url;
  });

  initSettings(() => { warmTextReader(); updateChip(); });
  initSearch();

  const setHeaderVar = () => document.documentElement.style.setProperty('--hh', $('hdr').offsetHeight + 'px');
  setHeaderVar();
  window.addEventListener('resize', () => { setHeaderVar(); layoutGuide(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopCamera(); cam.on = false; app.storage.flush(); updateChip(); } else openCamera();
  });
  window.addEventListener('pagehide', () => app.storage.flush());
}

/* ---------- start ---------- */

async function start() {
  app.storage = createStorage('local');
  app.state = await app.storage.load();
  app.photos = await app.storage.loadPhotos();
  if (!app.state.buckets.length) await app.storage.saveBucket(makeBucket({ offerPct: app.settings.defaultPct }));
  if (!activeBucket() || activeBucket().id !== app.settings.activeBucket) saveSettings(app.settings, { activeBucket: app.state.buckets[0].id });
  wire();
  layoutGuide();
  renderAll();
  openCamera();
  warmTextReader();
  if (!app.storage.persistent) toast("Can't save on this phone (private browsing?)");
}

start();
