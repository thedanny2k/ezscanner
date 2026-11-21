import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseQuery, pushRecent, searchCards, searchRows, toSearchRow } from '../src/search.js';
import { buildPriceFile } from '../src/providers/tcgplayer-data.js';
import tcgplayer, { setPriceFileUrl } from '../src/providers/tcgplayer.js';
import { searchText } from '../src/providers/index.js';

// Illustrative cards (names, sets and numbers shaped like TCGplayer's; not a real checklist).
const CARDS = [
  { name: 'Charizard', setName: 'Skyridge', setCode: 'SK', number: '146', total: 144, date: '2003/05/12' },
  { name: 'Charizard', setName: 'Sample Set', setCode: 'SMP', number: '014', total: 100, date: '2010/01/01' },
  { name: 'Charizard GX (Secret)', setName: 'Burning Shadows', setCode: 'SM03', number: '150', total: 147, date: '2017/08/04' },
  { name: 'Charizard G LV.X', setName: 'Supreme Victors', setCode: 'SV', number: '143', total: 147, date: '2009/08/19' },
  { name: 'Charmander', setName: 'Sample Set', setCode: 'SMP', number: '14', total: 100, date: '2010/01/01' },
  { name: 'Celebi', setName: 'Skyridge', setCode: 'SK', number: '145', total: 144, date: '2003/05/12' },
  { name: 'Celebi', setName: 'Neo Revelation', setCode: 'N3', number: '3', total: 64, date: '2001/09/21' },
  { name: 'Pikachu', setName: 'Scarlet & Violet Base Set', setCode: 'SVI', number: '025', total: 198, date: '2023/03/31' },
  { name: 'Pikachu ex', setName: 'Surging Sparks', setCode: 'SSP', number: '057', total: 191, date: '2024/11/08' },
  { name: 'Pikachu', setName: 'Silver Tempest Trainer Gallery', setCode: 'SIT', number: 'TG05', total: 30, date: '2022/11/11' },
  { name: 'Lugia V (Alternate Full Art)', setName: 'Silver Tempest', setCode: 'SIT', number: '186', total: 195, date: '2022/11/11' },
  { name: 'Flabébé', setName: 'Sample Set', setCode: 'SMP', number: '60', total: 100, date: '2010/01/01' },
].map(toSearchRow);

const names = (rows) => rows.map((r) => `${r.name} ${r.number}`);
const find = (text, opts) => searchRows(CARDS, text, opts).rows;

describe('reading what was typed', () => {
  it('splits words and possible collector numbers', () => {
    expect(parseQuery('Charizard 14')).toEqual({ terms: [{ w: 'charizard', num: '' }, { w: '14', num: '14' }], exact: null, empty: false });
    expect(parseQuery('#014').terms).toEqual([{ w: '014', num: '14' }]);
    expect(parseQuery('TG05').terms).toEqual([{ w: 'tg05', num: 'tg5' }]);
    expect(parseQuery('  ').empty).toBe(true);
  });

  it('treats "25/198" as an exact number and total', () => {
    expect(parseQuery('pikachu 025/198')).toEqual({ terms: [{ w: 'pikachu', num: '' }], exact: { num: '25', total: 198 }, empty: false });
    expect(parseQuery('TG05/TG30').exact).toEqual({ num: 'tg5', total: 30 });
  });

  it('ignores accents and capitals', () => {
    expect(names(find('FLABEBE'))).toEqual(['Flabébé 60']);
  });
});

describe('Collectr-style search', () => {
  it('"charizard 14" finds every Charizard numbered 14…, exact number first', () => {
    expect(names(find('charizard 14'))).toEqual(['Charizard 014', 'Charizard 146', 'Charizard G LV.X 143']);
  });

  it('every word has to match: name, set or number', () => {
    expect(names(find('charizard 14'))).not.toContain('Charmander 14');
    expect(names(find('celebi sky'))).toEqual(['Celebi 145']);
    expect(names(find('pikachu svi'))).toEqual(['Pikachu 025']);
  });

  it('a number with its total finds exactly that card', () => {
    expect(names(find('pikachu 25/198'))).toEqual(['Pikachu 025']);
    expect(names(find('25/198'))).toEqual(['Pikachu 025']);
    expect(find('pikachu 25/191')).toEqual([]);
  });

  it('finds subset numbers and variant names', () => {
    expect(names(find('tg05'))).toEqual(['Pikachu TG05']);
    expect(names(find('lugia alt'))).toEqual(['Lugia V (Alternate Full Art) 186']);
  });

  it('works while the last word is half typed, exact names first', () => {
    expect(names(find('chari'))).toHaveLength(4);
    expect(names(find('pikachu'))).toEqual(['Pikachu 025', 'Pikachu TG05', 'Pikachu ex 057']);
  });

  it('sorts by newest, oldest or number', () => {
    expect(names(find('charizard', { sort: 'newest' }))[0]).toBe('Charizard GX (Secret) 150');
    expect(names(find('charizard', { sort: 'oldest' }))[0]).toBe('Charizard 146');
    expect(names(find('charizard', { sort: 'number' }))).toEqual(['Charizard 014', 'Charizard G LV.X 143', 'Charizard 146', 'Charizard GX (Secret) 150']);
    expect(names(find('pikachu', { sort: 'number' })).at(-1)).toBe('Pikachu TG05');
  });

  it('caps long result lists but reports the full count', () => {
    const r = searchRows(CARDS, 'c', { limit: 2 });
    expect(r.rows).toHaveLength(2);
    expect(r.total).toBe(7);
    expect(searchRows(CARDS, '').rows).toEqual([]);
  });

  it('applies the same rules to a list of Cards', () => {
    const cards = [
      { name: 'Pikachu', setName: 'Base', setCode: 'BS', number: '58', printedTotal: 102, releaseDate: '1999/01/09' },
      { name: 'Raichu', setName: 'Base', setCode: 'BS', number: '14', printedTotal: 102, releaseDate: '1999/01/09' },
    ];
    expect(searchCards(cards, 'base 14').map((c) => c.name)).toEqual(['Raichu']);
  });
});

describe('recent searches', () => {
  it('keeps the newest first, without repeats, and at most 8', () => {
    let list = [];
    for (const q of ['pikachu', 'charizard 14', 'Pikachu ', 'celebi sky']) list = pushRecent(list, q);
    expect(list).toEqual(['celebi sky', 'Pikachu', 'charizard 14']);
    for (let i = 0; i < 20; i++) list = pushRecent(list, `card ${i}`);
    expect(list).toHaveLength(8);
    expect(pushRecent(['a'], '   ')).toEqual(['a']);
  });
});

describe('TCGplayer provider search', () => {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/tcgcsv-sample.json', import.meta.url), 'utf8'));
  const file = buildPriceFile(raw);
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(file)) })));
    setPriceFileUrl('https://ezscanner.test/prices/cards.json');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('searches the whole price file by name, number prefix and set', async () => {
    const lugia18 = await tcgplayer.search('lugia 18');
    expect(lugia18.map((c) => c.name)).toEqual(['Lugia V (Full Art)', 'Lugia V (Alternate Full Art)']);
    expect(lugia18.total).toBe(2);
    expect((await searchText(tcgplayer, 'charizard shadowless')).map((c) => c.setName)).toEqual(['Base Set (Shadowless)']);
    expect((await searchText(tcgplayer, 'charizard 4/102')).map((c) => c.setName).sort()).toEqual(['Base Set', 'Base Set (Shadowless)']);
  });

  it('returns Cards with every version, so the screen can show one tile per version', async () => {
    const [fletchling] = await tcgplayer.search('fletchling');
    expect(Object.keys(fletchling.prices)).toEqual(['normal', 'reverseHolofoil']);
    expect(fletchling.img).toMatch(/_200w\.jpg$/);
  });
});
