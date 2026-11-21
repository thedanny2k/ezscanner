// livePrices.js — TCGplayer's Near Mint market price, read live when a card goes into a bucket.
// The daily price file (providers/tcgplayer.js) still finds the card; this replaces its price with
// the number on the TCGplayer product page (Price Points → Market Price, Near Mint).
// The answer comes from our tcg-price function (supabase/functions/tcg-price). DOM-free and tested.
// Decision record: docs/decisions/0008-near-mint-prices-from-tcgplayer-site.md

/** The app's printing keys, split the way TCGplayer's answer is: one "Normal" price and one "Foil" price. */
export const FOIL_KEYS = ['holofoil', 'reverseHolofoil', '1stEditionHolofoil', 'unlimitedHolofoil'];
export const NONFOIL_KEYS = ['normal', '1stEditionNormal', '1stEdition', 'unlimited'];

/**
 * Which of this card's versions a live "normal" or "foil" price belongs to, or '' when it's unclear.
 * A card with one foil version (most ex, full arts, alt arts, SIRs: Holofoil only) is clear. A card
 * with Holofoil AND Reverse Holo gets one "Foil" number from TCGplayer, so we can't tell which it
 * is: those keep their daily price rather than risk the wrong one.
 * @param {{prices?:object}} card
 * @param {'normal'|'foil'} kind
 */
export function liveKeyFor(card, kind) {
  const keys = Object.keys(card.prices || {});
  const pool = kind === 'foil' ? FOIL_KEYS : NONFOIL_KEYS;
  const mine = keys.filter((k) => pool.includes(k));
  if (mine.length === 1) return mine[0];
  if (!keys.length) return kind === 'foil' ? 'holofoil' : 'normal'; // daily file had no versions yet
  return '';
}

/**
 * A copy of the card with live Near Mint prices where they clearly apply.
 * Each live price keeps the daily one next to it: { market: live, daily, live: true }.
 * @param {object} card
 * @param {{normal:number|null, foil:number|null}} live
 * @param {string} at ISO time of the answer
 * @returns {{card:object, applied:string[]}}
 */
export function applyLive(card, live, at) {
  const prices = { ...(card.prices || {}) };
  const applied = [];
  for (const kind of ['normal', 'foil']) {
    const v = live && live[kind];
    if (typeof v !== 'number') continue;
    const key = liveKeyFor(card, kind);
    if (!key) continue;
    const before = prices[key] || {};
    prices[key] = { market: v, daily: before.live ? before.daily : before.market, live: true };
    applied.push(key);
  }
  return { card: applied.length ? { ...card, prices, liveAt: at } : card, applied };
}

/** True when this item's chosen version is priced live (Near Mint), not from the daily file. */
export const isLive = (item) => !!(item && item.card && item.printing && ((item.card.prices || {})[item.printing] || {}).live);

/**
 * Talks to the tcg-price function: up to 50 cards per call, answers kept for a few minutes so
 * adding 10 copies of a card asks once.
 * @param {{url:string, fetchImpl?:typeof fetch, ttlMs?:number, now?:() => number}} opts
 */
export function createLiveClient({ url, fetchImpl = (...a) => fetch(...a), ttlMs = 5 * 60 * 1000, now = () => Date.now() }) {
  const cache = new Map(); // product id -> { t, price, at }
  return {
    enabled: !!url,
    /** @returns {Promise<{prices:Object<string,{normal:number|null, foil:number|null}>, at:string}>} */
    async get(ids, { fresh = false } = {}) {
      if (!url) throw new Error('Live prices are not set up.');
      const want = [...new Set(ids.map(String))].filter((id) => /^\d+$/.test(id));
      const prices = {};
      let at = '';
      const ask = [];
      for (const id of want) {
        const hit = cache.get(id);
        if (!fresh && hit && now() - hit.t < ttlMs) { prices[id] = hit.price; at = at || hit.at; } else ask.push(id);
      }
      for (let i = 0; i < ask.length; i += 50) {
        const batch = ask.slice(i, i + 50);
        let res;
        try {
          res = await fetchImpl(`${url}?ids=${batch.join(',')}`, { cache: 'no-store' });
        } catch (e) {
          throw new Error("Couldn't reach the live price service.");
        }
        if (!res.ok) throw new Error(`Live price service error (${res.status}).`);
        const j = await res.json();
        at = j.at || at;
        for (const [id, price] of Object.entries(j.prices || {})) {
          prices[id] = price;
          cache.set(id, { t: now(), price, at: j.at });
        }
      }
      return { prices, at: at || new Date(now()).toISOString() };
    },
  };
}

/**
 * Prices these bucket items live. Only TCGplayer cards can be looked up by product id.
 * Updates item.card in place and returns the items whose price changed.
 */
export async function refreshItemsLive(items, client, opts) {
  const todo = items.filter((it) => it.card && it.card.source === 'tcgplayer' && it.status !== 'failed');
  if (!todo.length || !client.enabled) return [];
  const { prices, at } = await client.get(todo.map((it) => it.card.sourceId), opts);
  const changed = [];
  for (const it of todo) {
    const live = prices[it.card.sourceId];
    if (!live) continue;
    const { card, applied } = applyLive(it.card, live, at);
    if (!applied.length) continue;
    it.card = card;
    if (!it.printing || !card.prices[it.printing]) it.printing = applied[0];
    changed.push(it);
  }
  return changed;
}
