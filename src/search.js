// search.js — typed card search, Collectr style. Pure functions, unit-tested.
//
// Every word you type has to match the card somewhere: its name, its set name, its set code,
// or the start of its collector number. So:
//   "charizard 14"   -> every Charizard numbered 14, then 140–149 (exact number first)
//   "celebi sky"     -> Celebi from Skyridge
//   "pikachu 25/198" -> exactly Pikachu 25/198
//   "lugia alt"      -> Lugia V (Alternate Full Art), ...
// The last word can be half typed ("chari"), so results update while you type.

import { normName, normNumStr } from './match.js';

export const SORTS = {
  best: 'Best match',
  newest: 'Newest set first',
  oldest: 'Oldest set first',
  number: 'Card number',
};

/**
 * @returns {{terms:{w:string, num:string}[], exact:{num:string, total:number}|null, empty:boolean}}
 *   `num` is set when a word has digits and could be a collector number ("14", "tg05", "swsh050").
 */
export function parseQuery(text) {
  let t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let exact = null;
  const m = t.match(/(^|[^a-z0-9])([a-z]{0,5}\d{1,4}[a-z]?)\s*\/\s*([a-z]{0,5})(\d{1,4})(?![0-9])/);
  if (m) {
    exact = { num: normNumStr(m[2]), total: parseInt(m[4], 10) };
    t = t.replace(m[0], `${m[1]} `);
  }
  const terms = (t.match(/[a-z0-9]+/g) || []).map((w) => ({ w, num: /\d/.test(w) ? normNumStr(w) : '' }));
  return { terms, exact, empty: !terms.length && !exact };
}

/** Sort key for a collector number: main-set numbers before subset ones (TG, GG, SV...), then by value. */
function numberKey(number) {
  const m = String(number || '').match(/^([A-Za-z]*)(\d+)/);
  if (!m) return 1e9;
  return (m[1] ? 1e6 : 0) + parseInt(m[2], 10);
}

/**
 * The searchable form of one card. Extra fields on `card` are kept, so a provider can store
 * its own data on the row.
 * @param {{name:string, setName?:string, setCode?:string, number?:string, total?:number|'', date?:string, setTokens?:string[]}} card
 */
export function toSearchRow(card) {
  const norm = normName(card.name);
  const setTokens = card.setTokens || normName(card.setName).split(' ').filter(Boolean);
  const tokens = norm.split(' ').filter(Boolean).concat(setTokens);
  if (card.setCode) tokens.push(String(card.setCode).toLowerCase());
  return {
    ...card,
    norm,
    tokens,
    num: normNumStr(card.number),
    total: card.total || '',
    date: card.date || '',
    nkey: numberKey(card.number),
  };
}

/** Does this row match every word of the query? */
export function matchRow(row, q) {
  if (q.exact) {
    if (row.num !== q.exact.num) return false;
    if (q.exact.total && row.total && row.total !== q.exact.total) return false;
  }
  for (const { w, num } of q.terms) {
    if (num && row.num.startsWith(num)) continue;
    if (!row.tokens.some((t) => t.startsWith(w))) return false;
  }
  return true;
}

/** Higher is better: exact collector number, then exact name, then name starting with what was typed. */
export function scoreRow(row, q) {
  let s = 0;
  if (q.exact || q.terms.some((t) => t.num && row.num === t.num)) s += 8;
  // The words that matched the name (not the set or the number), in the order typed.
  const nameTokens = row.norm.split(' ');
  const words = q.terms.map((t) => t.w).filter((w) => nameTokens.some((n) => n.startsWith(w)));
  const typed = words.join(' ');
  if (typed && row.norm === typed) s += 4;
  else if (typed && row.norm.startsWith(typed)) s += 2;
  for (const w of words) if (nameTokens.includes(w)) s += 0.5;
  return s;
}

/** Newest (or oldest) set first; sets with no known release date always go last. */
const byDate = (newestFirst) => (a, b) => {
  if (a.date === b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return (a.date < b.date ? 1 : -1) * (newestFirst ? 1 : -1);
};
const byNewest = byDate(true);
const byOldest = byDate(false);
const COMPARE = {
  best: (a, b) => b.s - a.s || byNewest(a.r, b.r) || a.r.nkey - b.r.nkey,
  newest: (a, b) => byNewest(a.r, b.r) || a.r.nkey - b.r.nkey,
  oldest: (a, b) => byOldest(a.r, b.r) || a.r.nkey - b.r.nkey,
  number: (a, b) => a.r.nkey - b.r.nkey || byNewest(a.r, b.r),
};

/**
 * Matching rows, sorted.
 * @returns {{rows:object[], total:number}} `total` counts every match before the limit
 */
export function searchRows(rows, text, { sort = 'best', limit = 400 } = {}) {
  const q = parseQuery(text);
  if (q.empty) return { rows: [], total: 0 };
  const hits = [];
  for (const r of rows) if (matchRow(r, q)) hits.push({ r, s: sort === 'best' ? scoreRow(r, q) : 0 });
  hits.sort(COMPARE[sort] || COMPARE.best);
  return { rows: hits.slice(0, limit).map((h) => h.r), total: hits.length };
}

/** The same search over Card objects (for providers that search online and return a short list). */
export function searchCards(cards, text, opts) {
  const rows = cards.map((c) => toSearchRow({ name: c.name, setName: c.setName, setCode: c.setCode, number: c.number, total: c.printedTotal, date: c.releaseDate, card: c }));
  return searchRows(rows, text, opts).rows.map((r) => r.card);
}

/** Recent searches: newest first, no duplicates (ignoring case), at most `max`. */
export function pushRecent(list, query, max = 8) {
  const q = String(query || '').trim().replace(/\s+/g, ' ');
  if (!q) return list.slice(0, max);
  return [q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, max);
}
