// tcgplayer-data.js — the price file format, shared by the nightly build script (Node) and the
// TCGplayer provider (browser). Pure functions only, so both sides are unit-tested.
//
// The file is prices/cards.json, built once a day from tcgcsv.com (a public mirror of TCGplayer's
// own API) by scripts/build-prices.mjs. It holds every English Pokémon single on TCGplayer and,
// for each printing, ONLY TCGplayer's Market Price: the number on the product page that buyers
// like us are paid off. No listing prices, no low/mid/high. See docs/decisions/0007.
//
// Format (v1), kept compact because a phone downloads it:
// {
//   v: 1,
//   source: 'TCGplayer Market Price via tcgcsv.com',
//   updated: '2026-11-19T20:05:11Z',            // when TCGplayer's numbers were pulled
//   built: '2026-11-19T21:40:02Z',              // when this file was made
//   printings: ['Normal', 'Holofoil', ...],     // TCGplayer subTypeName values
//   rarities: ['Common', ...],
//   groups: [[groupId, setName, setCode, 'YYYY/MM/DD'], ...],
//   cards: [[productId, groupIndex, name, number, rarityIndex, [printingIndex, market, ...]], ...]
// }
// `market` is null when TCGplayer has no market price for that printing (no recent sales).

export const PRICE_FILE_VERSION = 1;
export const CDN = 'https://tcgplayer-cdn.tcgplayer.com/product';
export const productUrl = (id) => `https://www.tcgplayer.com/product/${id}`;

/** TCGplayer subTypeName -> the app's printing key: "Reverse Holofoil" -> "reverseHolofoil". */
export function printingKey(subTypeName) {
  const words = String(subTypeName || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'normal';
  return words.map((w, i) => (i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1))).join('');
}

/**
 * TCGplayer group name -> the set name printed on boxes and used by players.
 * "SV01: Scarlet & Violet Base Set" -> "Scarlet & Violet Base Set", "SM - Burning Shadows" -> "Burning Shadows".
 * Names without a series prefix ("Base Set (Shadowless)", "McDonald's Promos 2019") are left alone.
 */
export function cleanSetName(name) {
  const s = String(name || '').trim();
  const colon = s.match(/^[A-Z][A-Za-z0-9]{0,7}:\s+(.+)$/);
  if (colon) return colon[1];
  const dash = s.match(/^(?:XY|SM|BW|HGSS|DP|EX|SWSH|SV|ME|POP|Platinum|HeartGold SoulSilver)\s+-\s+(.+)$/);
  if (dash) return dash[1];
  return s;
}

/**
 * Drops a collector number TCGplayer sometimes appends: "Charizard ex - 199/165" -> "Charizard ex".
 * Variant notes stay, because they tell versions apart: "Lugia V (Alternate Full Art)".
 */
export function cleanCardName(name) {
  return String(name || '')
    .replace(/\s+-\s+[A-Za-z]{0,5}\d{1,4}[a-z]?(?:\/[A-Za-z]{0,5}\d{1,4})?(?=\s*\(|\s*$)/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** "025/198" -> {number:'025', total:198}; "TG05/TG30" -> {number:'TG05', total:30}; "SWSH050" -> {number:'SWSH050', total:''}. */
export function splitNumber(value) {
  const v = String(value || '').trim().replace(/\s+/g, '');
  const [number, totalRaw = ''] = v.split('/');
  const t = (totalRaw.match(/\d+/) || [])[0];
  return { number: number || '', total: t ? parseInt(t, 10) : '' };
}

const ext = (product, key) => {
  const e = (product.extendedData || []).find((x) => x.name === key);
  return e ? String(e.value ?? '').trim() : '';
};

/** "2023-03-31T00:00:00" -> "2023/03/31". */
const day = (iso) => (String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/) || []).slice(1).join('/');

/** A product is a single card if TCGplayer gives it a collector number or a rarity (sealed product has neither). */
export function isSingle(product) {
  const rarity = ext(product, 'Rarity');
  if (rarity === 'Code Card') return false;
  return !!(ext(product, 'Number') || rarity);
}

const round2 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

/**
 * Builds the price file from raw tcgcsv responses.
 * @param {{groups:object[], products:Object<string,object[]>, prices:Object<string,object[]>, updated:string, built?:string}} raw
 *        products and prices are keyed by groupId, each the `results` array tcgcsv returns
 */
export function buildPriceFile({ groups, products, prices, updated, built = new Date().toISOString() }) {
  const printings = [];
  const rarities = [];
  const indexOf = (list, value) => {
    let i = list.indexOf(value);
    if (i < 0) { list.push(value); i = list.length - 1; }
    return i;
  };
  const outGroups = [];
  const cards = [];
  const sorted = [...groups].sort((a, b) => String(b.publishedOn).localeCompare(String(a.publishedOn)) || a.groupId - b.groupId);
  for (const g of sorted) {
    const singles = (products[g.groupId] || []).filter(isSingle);
    if (!singles.length) continue;
    const gi = outGroups.length;
    outGroups.push([g.groupId, cleanSetName(g.name), g.abbreviation || '', day(g.publishedOn)]);
    const byProduct = new Map();
    for (const p of prices[g.groupId] || []) {
      if (!byProduct.has(p.productId)) byProduct.set(p.productId, []);
      byProduct.get(p.productId).push(indexOf(printings, p.subTypeName || 'Normal'), round2(p.marketPrice));
    }
    for (const p of singles) {
      cards.push([p.productId, gi, cleanCardName(p.name), ext(p, 'Number'), indexOf(rarities, ext(p, 'Rarity')), byProduct.get(p.productId) || []]);
    }
  }
  return { v: PRICE_FILE_VERSION, source: 'TCGplayer Market Price via tcgcsv.com', updated, built, printings, rarities, groups: outGroups, cards };
}

/** Checks a downloaded price file before the app trusts it. Throws with a readable message. */
export function checkPriceFile(file) {
  if (!file || typeof file !== 'object') throw new Error('Price file is empty or not JSON.');
  if (file.v !== PRICE_FILE_VERSION) throw new Error(`Price file is version ${file.v}; this app reads version ${PRICE_FILE_VERSION}. Reload the app.`);
  for (const k of ['printings', 'rarities', 'groups', 'cards']) if (!Array.isArray(file[k])) throw new Error(`Price file is missing "${k}".`);
  return file;
}

/** One row of the file -> the app's Card fields (see providers/provider.js). */
export function rowToFields(file, row) {
  const [productId, gi, name, numberValue, ri, priceList] = row;
  const [, setName, setCode, releaseDate] = file.groups[gi] || [];
  const { number, total } = splitNumber(numberValue);
  const prices = {};
  for (let i = 0; i < priceList.length; i += 2) {
    const key = printingKey(file.printings[priceList[i]]);
    const market = priceList[i + 1];
    if (!prices[key] || typeof prices[key].market !== 'number') prices[key] = { market: typeof market === 'number' ? market : undefined };
  }
  return {
    name,
    number,
    printedTotal: total,
    setName: setName || '',
    setCode: setCode || '',
    releaseDate: releaseDate || '',
    rarity: file.rarities[ri] || '',
    img: `${CDN}/${productId}_200w.jpg`,
    imgLarge: `${CDN}/${productId}_in_1000x1000.jpg`,
    prices,
    updatedAt: day(file.updated),
    tcgUrl: productUrl(productId),
  };
}
