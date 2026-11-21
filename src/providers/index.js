// providers/index.js — the one place that knows which price sources exist.

import tcgplayer from './tcgplayer.js';
import pokemontcgio from './pokemontcgio.js';
import tcgdex from './tcgdex.js';
import scrydex from './scrydex.js';
import { scoreCards, splitQuery } from '../match.js';
import { searchCards } from '../search.js';

export const PROVIDERS = { tcgplayer, pokemontcgio, tcgdex, scrydex };

// TCGplayer's own Market Price, published daily with the site (docs/decisions/0007).
export const DEFAULT_PROVIDER = 'tcgplayer';

export function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS[DEFAULT_PROVIDER];
}

/**
 * Typed search ("charizard 14", "celebi sky", "pikachu 25/198"), best first.
 * Providers with their own `search` (TCGplayer: in memory) use it; others look up candidates
 * online and the same matching rules are applied to what comes back.
 * @param {{sort?:string, key?:string}} [opts]
 */
export async function searchText(provider, text, opts = {}) {
  if (typeof provider.search === 'function') return provider.search(text, opts);
  const { num, name } = splitQuery(text);
  const cards = await provider.findCards({ num, name }, opts);
  const ranked = scoreCards(cards, { text: name, name, num }).map((x) => x.c);
  return opts.sort && opts.sort !== 'best' ? searchCards(ranked, text, { sort: opts.sort }) : ranked;
}
