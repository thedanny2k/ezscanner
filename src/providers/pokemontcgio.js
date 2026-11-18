// pokemontcgio.js — the legacy Pokémon TCG API (what the prototype uses).
// Deprecated: no new API keys; existing access works through March 1, 2027. Kept as a provider
// so the app works today and can be switched off with one setting.

import { makeCard } from './provider.js';
import { numberVariants } from '../match.js';

const BASE = 'https://api.pokemontcg.io/v2/cards';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** pokemontcg.io card JSON -> app Card. Its price keys already match the app's canonical keys. */
export function fromPokemonTcgIo(c) {
  const set = c.set || {};
  const tp = c.tcgplayer || {};
  const prices = {};
  for (const [k, p] of Object.entries(tp.prices || {})) {
    prices[k] = { market: p.market ?? undefined, low: p.low ?? undefined, mid: p.mid ?? undefined, high: p.high ?? undefined };
  }
  return makeCard('pokemontcgio', c.id, {
    name: c.name,
    number: String(c.number || ''),
    printedTotal: set.printedTotal || '',
    setName: set.name || '',
    setCode: set.ptcgoCode || '',
    releaseDate: set.releaseDate || '',
    rarity: c.rarity || '',
    img: (c.images || {}).small || '',
    imgLarge: (c.images || {}).large || '',
    prices,
    updatedAt: tp.updatedAt || '',
    tcgUrl: tp.url || '',
  });
}

async function query(q, { key, pageSize = 36 } = {}) {
  const params = new URLSearchParams({ q, pageSize: String(pageSize), orderBy: '-set.releaseDate', select: 'id,name,number,rarity,set,images,tcgplayer' });
  const headers = key ? { 'X-Api-Key': key } : {};
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(`${BASE}?${params}`, { headers });
    } catch (e) {
      if (attempt < 2) { await sleep(800 * (attempt + 1)); continue; }
      throw new Error("Couldn't reach pokemontcg.io. Check your connection.");
    }
    if (res.status >= 500 && attempt < 2) { await sleep(800 * (attempt + 1)); continue; }
    break;
  }
  if (res.status === 429) throw new Error('pokemontcg.io lookup limit reached. Try again later or switch price source.');
  if (!res.ok) throw new Error(`pokemontcg.io error (${res.status}).`);
  const json = await res.json();
  return (json.data || []).map(fromPokemonTcgIo);
}

const numberClause = (num) => '(' + numberVariants(num).map((v) => `number:"${v}"`).join(' OR ') + ')';

function nameClause(s) {
  const words = (s || '').toLowerCase().replace(/[^a-zà-ÿ0-9'’.\- ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return `name:${words[0].replace(/['’.\-]/g, '')}*`;
  return `name:"${words.join(' ').replace(/"/g, '')}"`;
}

const sameFirstWord = (a, b) => a.toLowerCase().split(' ')[0] === b.toLowerCase().split(' ')[0];

export default {
  id: 'pokemontcgio',
  label: 'pokemontcg.io (legacy, until Mar 1, 2027)',
  needsKey: false,

  async findCards({ num, name }, opts = {}) {
    const nc = nameClause(name);
    let cards = [];
    if (num && num.total) cards = await query(`${numberClause(num)} set.printedTotal:${num.total}`, opts);
    const nameHit = name && cards.some((c) => sameFirstWord(c.name, name));
    if (num && nc && !nameHit) {
      const more = await query(`${nc} ${numberClause(num)}`, opts);
      const seen = new Set(cards.map((c) => c.id));
      cards = cards.concat(more.filter((c) => !seen.has(c.id)));
    }
    if (!cards.length && nc) cards = await query(nc, opts);
    return cards;
  },

  async getByIds(ids, opts = {}) {
    const out = [];
    const uniq = [...new Set(ids)].filter(Boolean);
    for (let i = 0; i < uniq.length; i += 40) {
      const chunk = uniq.slice(i, i + 40);
      out.push(...(await query(chunk.map((id) => `id:"${id}"`).join(' OR '), { ...opts, pageSize: 250 })));
    }
    return out;
  },
};
