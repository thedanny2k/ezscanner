// provider.js — the contract every price source implements.
// Swapping TCGplayer, TCGdex, Scrydex or pokemontcg.io is a settings change because the rest of the
// app only ever talks to this shape. See docs/decisions/0003-swappable-price-provider.md.

/**
 * A card in the app's own shape. Providers convert their data into this.
 * @typedef {Object} Card
 * @property {string} id             `${source}:${sourceId}`, unique across providers
 * @property {string} source         provider id: 'tcgplayer' | 'tcgdex' | 'scrydex' | 'pokemontcgio'
 * @property {string} sourceId       the card's id inside that provider
 * @property {string} name           as printed, e.g. "Pikachu ex"
 * @property {string} number         collector number without the total, e.g. "25" or "TG05"
 * @property {number|''} printedTotal number after the slash, e.g. 198
 * @property {string} setName
 * @property {string} setCode        small printed code, e.g. "SVI" ('' when unknown)
 * @property {string} releaseDate    'YYYY/MM/DD' or ''
 * @property {string} rarity
 * @property {string} img            small image URL
 * @property {string} imgLarge       large image URL (used by the visual double-check)
 * @property {Object<string, {market?:number, low?:number, mid?:number, high?:number}>} prices
 *           TCGplayer USD prices keyed by the canonical printing keys in src/cards.js
 * @property {string} updatedAt      when the provider last refreshed prices
 * @property {string} tcgUrl         link to the TCGplayer product page ('' when unknown)
 */

/**
 * @typedef {Object} PriceProvider
 * @property {string} id
 * @property {string} label          shown in Settings
 * @property {boolean} needsKey
 * @property {(query:{num:object|null, name:string}, opts?:{key?:string}) => Promise<Card[]>} findCards
 *           candidates for a collector number and/or name (num comes from src/match.js)
 * @property {(ids:string[], opts?:{key?:string}) => Promise<Card[]>} getByIds
 *           fresh copies of saved cards (price refresh, CSV import)
 */

export const REQUIRED = { id: 'string', label: 'string', needsKey: 'boolean', findCards: 'function', getByIds: 'function' };

/** Throws if an object doesn't satisfy the PriceProvider contract (used by tests). */
export function assertProvider(p) {
  for (const [key, type] of Object.entries(REQUIRED)) {
    if (typeof p[key] !== type) throw new Error(`Provider "${p.id || '?'}" is missing ${key} (${type})`);
  }
  return true;
}

/** Shared helper so every provider builds the same Card. */
export function makeCard(source, sourceId, fields) {
  return {
    id: `${source}:${sourceId}`,
    source,
    sourceId,
    name: '',
    number: '',
    printedTotal: '',
    setName: '',
    setCode: '',
    releaseDate: '',
    rarity: '',
    img: '',
    imgLarge: '',
    prices: {},
    updatedAt: '',
    tcgUrl: '',
    ...fields,
  };
}
