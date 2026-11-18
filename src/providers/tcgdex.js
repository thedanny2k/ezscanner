// tcgdex.js — TCGdex, a free community Pokémon TCG API (no key) that includes TCGplayer prices.
// Planned default price source. STATUS (v0.1): the field mapping is written and unit-tested
// against a sample response; the live search flow is untested. Verify both in v0.3 (issue:
// "Verify TCGdex price freshness and version coverage") before making this the default.
// Docs: https://tcgdex.dev/reference/card  ·  https://tcgdex.dev/markets-prices

import { makeCard } from './provider.js';
import { normNumStr, normName } from '../match.js';

const BASE = 'https://api.tcgdex.net/v2/en';

/** TCGdex variant names -> the app's canonical printing keys (src/cards.js). */
const VARIANTS = {
  normal: 'normal',
  holofoil: 'holofoil',
  holo: 'holofoil',
  'reverse-holofoil': 'reverseHolofoil',
  reverse: 'reverseHolofoil',
  '1st-edition': '1stEdition',
  '1st-edition-holofoil': '1stEditionHolofoil',
  unlimited: 'unlimited',
  'unlimited-holofoil': 'unlimitedHolofoil',
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** TCGdex full card JSON -> app Card. */
export function fromTcgdex(c) {
  const set = c.set || {};
  const tp = (c.pricing || {}).tcgplayer || {};
  const prices = {};
  for (const [variant, key] of Object.entries(VARIANTS)) {
    const p = tp[variant];
    if (!p || prices[key]) continue;
    prices[key] = {
      market: num(p.marketPrice ?? p.market),
      low: num(p.lowPrice ?? p.low),
      mid: num(p.midPrice ?? p.mid),
      high: num(p.highPrice ?? p.high),
    };
  }
  const official = (set.cardCount || {}).official;
  return makeCard('tcgdex', c.id, {
    name: c.name || '',
    number: String(c.localId ?? ''),
    printedTotal: official || '',
    setName: set.name || '',
    setCode: (set.abbreviation && set.abbreviation.official) || '',
    releaseDate: (set.releaseDate || '').replace(/-/g, '/'),
    rarity: c.rarity || '',
    img: c.image ? `${c.image}/low.webp` : '',
    imgLarge: c.image ? `${c.image}/high.webp` : '',
    prices,
    updatedAt: tp.updated ? String(tp.updated) : '',
  });
}

async function get(path) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`);
  } catch (e) {
    throw new Error("Couldn't reach TCGdex. Check your connection.");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TCGdex error (${res.status}).`);
  return res.json();
}

async function fullCards(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 6) {
    const batch = await Promise.all(ids.slice(i, i + 6).map((id) => get(`/cards/${encodeURIComponent(id)}`)));
    out.push(...batch.filter(Boolean).map(fromTcgdex));
  }
  return out;
}

export default {
  id: 'tcgdex',
  label: 'TCGdex (free)',
  needsKey: false,

  // TODO(v0.3): verify against the live API. Plan: name search returns brief cards
  // (id, localId, name, image); keep those whose number matches, then fetch full cards
  // (with set + pricing) by id. A number-only search needs a set filter — not built yet.
  async findCards({ num, name }) {
    if (!name) throw new Error('TCGdex search needs a card name (number-only search is not built yet).');
    const brief = (await get(`/cards?name=${encodeURIComponent(name)}`)) || [];
    const want = num ? normNumStr(num.prefix + num.digits + num.suffix) : null;
    let picked = brief.filter((b) => !want || normNumStr(String(b.localId)) === want);
    if (!picked.length) picked = brief.filter((b) => normName(b.name) === normName(name));
    const cards = await fullCards(picked.slice(0, 24).map((b) => b.id));
    return num && num.total ? cards.sort((a, b) => Number(b.printedTotal === num.total) - Number(a.printedTotal === num.total)) : cards;
  },

  async getByIds(ids) {
    return fullCards([...new Set(ids)].filter(Boolean));
  },
};
