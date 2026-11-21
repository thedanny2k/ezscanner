// tcgplayer.js — prices straight from TCGplayer's own price guide: the Market Price per printing,
// the number we're paid off. The default price source from v0.3 (docs/decisions/0007).
//
// The phone never calls TCGplayer. A GitHub Action (scripts/build-prices.mjs) downloads the whole
// English Pokémon price guide once a day from tcgcsv.com and publishes it with the site as
// prices/cards.json. This provider loads that one file and searches it in memory, so lookups are
// instant, free and need no key.

import { makeCard } from './provider.js';
import { checkPriceFile, rowToFields, splitNumber } from './tcgplayer-data.js';
import { normName, normNum } from '../match.js';
import { searchRows, toSearchRow } from '../search.js';

const SOURCE = 'tcgplayer';
const DEFAULT_URL = new URL('../../prices/cards.json', import.meta.url).href;
const MAX_AGE_MS = 3 * 60 * 60 * 1000; // an app left open overnight picks up the new day's prices

let url = DEFAULT_URL;
let db = null; // { file, rows, byNum, byId, loadedAt }
let pending = null;

/** Tests and local tools can point the provider at another file. */
export function setPriceFileUrl(u) {
  url = u;
  db = null;
  pending = null;
}

function index(file) {
  const groups = file.groups.map(([, setName, setCode, date]) => ({ setTokens: normName(setName).split(' ').filter(Boolean), setCode, date }));
  const rows = file.cards.map((r) => {
    const { number, total } = splitNumber(r[3]);
    const g = groups[r[1]] || { setTokens: [] };
    return toSearchRow({ r, id: String(r[0]), name: r[2], number, total, setTokens: g.setTokens, setCode: g.setCode, date: g.date });
  });
  const byNum = new Map();
  const byId = new Map();
  for (const row of rows) {
    byId.set(row.id, row);
    if (!row.num) continue;
    if (!byNum.has(row.num)) byNum.set(row.num, []);
    byNum.get(row.num).push(row);
  }
  return { file, rows, byNum, byId, loadedAt: Date.now() };
}

async function fetchFile(revalidate) {
  let res;
  try {
    res = await fetch(url, { cache: revalidate ? 'no-cache' : 'default' });
  } catch (e) {
    throw new Error("Couldn't load TCGplayer prices. Check your connection.");
  }
  if (res.status === 404) {
    throw new Error('TCGplayer prices aren’t published yet. On GitHub, run Actions → “Deploy to GitHub Pages” once (or `npm run prices` when testing on your computer).');
  }
  if (!res.ok) throw new Error(`Couldn't load TCGplayer prices (${res.status}).`);
  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error('The TCGplayer price file is damaged. Run the Deploy workflow again.');
  }
  return index(checkPriceFile(json));
}

/** The loaded price guide. `revalidate` asks the server whether a newer file exists (cheap when it hasn't changed). */
export async function load(revalidate = false) {
  const stale = db && Date.now() - db.loadedAt > MAX_AGE_MS;
  if (db && !revalidate && !stale) return db;
  if (!pending) {
    pending = fetchFile(revalidate || stale)
      .then((d) => (db = d))
      .finally(() => { pending = null; });
  }
  try {
    return await pending;
  } catch (e) {
    if (db) return db; // keep working with what's loaded if a refresh fails
    throw e;
  }
}

const toCard = (d, row) => makeCard(SOURCE, row.id, rowToFields(d.file, row.r));
const firstWord = (s) => normName(s).split(' ')[0] || '';
const sameFirstWord = (row, name) => !!name && row.norm.split(' ')[0] === firstWord(name);

/**
 * Cards whose name contains every typed word ("umbreon vmax", "char"), exact names first, newest first.
 * The last word may be partly typed.
 */
function nameSearch(d, name, limit) {
  const words = normName(name).split(' ').filter(Boolean);
  if (!words.length) return [];
  const last = words.length - 1;
  const want = words.join(' ');
  const hits = d.rows.filter((row) => {
    const tokens = row.norm.split(' ');
    return words.every((w, i) => tokens.some((t) => (i === last ? t.startsWith(w) : t === w)));
  });
  const rank = (row) => (row.norm === want ? 0 : row.norm.startsWith(want + ' ') ? 1 : 2);
  // Rows are stored newest set first, so a stable sort keeps newest first within each rank.
  return hits.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

export default {
  id: SOURCE,
  label: 'TCGplayer market price (updated daily)',
  needsKey: false,

  async findCards({ num, name }) {
    const d = await load();
    let hits = [];
    if (num) {
      const all = d.byNum.get(normNum(num)) || [];
      hits = num.total ? all.filter((row) => !row.total || row.total === num.total) : all;
      // The total may be misread, or the name may point somewhere else: keep same-number cards
      // with the right name, then fall back to a name search.
      if (name && !hits.some((row) => sameFirstWord(row, name))) {
        const extra = all.filter((row) => !hits.includes(row) && sameFirstWord(row, name));
        hits = hits.concat(extra.length ? extra : nameSearch(d, name, 30).filter((row) => !hits.includes(row)));
      }
    }
    if (!hits.length && name) hits = nameSearch(d, name, 60);
    return hits.slice(0, 60).map((row) => toCard(d, row));
  },

  /**
   * Typed search, Collectr style (src/search.js): "charizard 14", "celebi sky", "pikachu 25/198".
   * Runs in memory, so it's fast enough to update on every keystroke.
   */
  async search(text, { sort = 'best', limit = 400 } = {}) {
    const d = await load();
    const { rows, total } = searchRows(d.rows, text, { sort, limit });
    const cards = rows.map((row) => toCard(d, row));
    cards.total = total;
    return cards;
  },

  /** What the loaded price file covers, so the app can show it (and warn about test builds). */
  async info() {
    const d = await load();
    const f = d.file;
    return { sets: f.groups.length, cards: f.cards.length, updated: (String(f.updated).match(/^(\d{4})-(\d{2})-(\d{2})/) || []).slice(1).join('/'), partial: f.partial || null };
  },

  /** Starts loading the price file early (when the search screen opens). */
  warm() {
    return load().then(() => true);
  },

  /** Fresh copies of saved cards: asks the server for today's file first. */
  async getByIds(ids) {
    const d = await load(true);
    return [...new Set(ids)].map((id) => d.byId.get(String(id))).filter(Boolean).map((row) => toCard(d, row));
  },
};
