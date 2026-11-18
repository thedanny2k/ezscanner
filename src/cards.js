// cards.js — the app's own card shape and printing (version) helpers.
// Every price provider converts its data into this shape, so the rest of the app never
// knows which provider is active.

/** Canonical printing keys used everywhere in the app. Providers map their own names onto these. */
export const PRINTINGS = {
  normal: 'Normal',
  holofoil: 'Holofoil',
  reverseHolofoil: 'Reverse Holo',
  '1stEditionHolofoil': '1st Ed. Holo',
  '1stEditionNormal': '1st Edition',
  unlimitedHolofoil: 'Unlimited Holo',
  '1stEdition': '1st Edition',
  unlimited: 'Unlimited',
};

const ORDER = ['holofoil', 'normal', 'reverseHolofoil', '1stEditionHolofoil', '1stEditionNormal', 'unlimitedHolofoil', '1stEdition', 'unlimited'];
const orderIdx = (k) => {
  const i = ORDER.indexOf(k);
  return i < 0 ? 99 : i;
};

/** Printings this card has prices for, most common first. */
export const printingKeys = (card) => Object.keys(card.prices || {}).sort((a, b) => orderIdx(a) - orderIdx(b));

/** First printing that has a market price. */
export function defaultPrinting(card) {
  const keys = printingKeys(card);
  return keys.find((k) => typeof (card.prices[k] || {}).market === 'number') || keys[0] || '';
}

/**
 * Picks the printing that matches what the AI saw on the card.
 * @param {string} finish 'holo' | 'reverse_holo' | 'non_holo' | 'unknown'
 * @param {boolean} firstEdition
 */
export function printingFromFinish(card, finish, firstEdition) {
  const keys = printingKeys(card);
  const has = (k) => keys.includes(k);
  if (firstEdition) {
    if (finish === 'holo' && has('1stEditionHolofoil')) return '1stEditionHolofoil';
    if (has('1stEditionNormal')) return '1stEditionNormal';
    if (has('1stEdition')) return '1stEdition';
  }
  if (finish === 'reverse_holo' && has('reverseHolofoil')) return 'reverseHolofoil';
  if (finish === 'holo') {
    if (has('holofoil')) return 'holofoil';
    if (has('unlimitedHolofoil')) return 'unlimitedHolofoil';
  }
  if (finish === 'non_holo') {
    if (has('normal')) return 'normal';
    if (has('unlimited')) return 'unlimited';
  }
  return defaultPrinting(card);
}

/** "25/198", "TG05/TG30", or just "SWSH050" for promos. */
export function fmtNum(card) {
  if (!card.printedTotal) return card.number;
  const pre = (card.number.match(/^[A-Z]+/) || [''])[0];
  if (pre && !['TG', 'GG', 'RC', 'SV', 'SH', 'SL', 'H'].includes(pre)) return card.number;
  return `${card.number}/${pre}${card.printedTotal}`;
}

/** TCGplayer market price for a scanned item, or undefined. */
export const marketOf = (item) => (item.card && item.printing ? (item.card.prices[item.printing] || {}).market : undefined);

export const tcgplayerSearchUrl = (card) =>
  card.tcgUrl || 'https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=' + encodeURIComponent(`${card.name} ${card.setName}`);
