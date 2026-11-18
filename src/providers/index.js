// providers/index.js — the one place that knows which price sources exist.

import pokemontcgio from './pokemontcgio.js';
import tcgdex from './tcgdex.js';
import scrydex from './scrydex.js';
import { scoreCards, splitQuery } from '../match.js';

export const PROVIDERS = { tcgdex, scrydex, pokemontcgio };

// pokemontcg.io works today; switch to 'tcgdex' once the v0.3 check passes.
export const DEFAULT_PROVIDER = 'pokemontcgio';

export function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS[DEFAULT_PROVIDER];
}

/** Typed search ("charizard 4/102", "umbreon vmax", "25/198"), ranked best first. */
export async function searchText(provider, text, opts) {
  const { num, name } = splitQuery(text);
  const cards = await provider.findCards({ num, name }, opts);
  return scoreCards(cards, { text: name, name, num }).map((x) => x.c);
}
