import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPriceFile, checkPriceFile, cleanCardName, cleanSetName, printingKey, rowToFields, splitNumber,
} from '../src/providers/tcgplayer-data.js';
import tcgplayer, { setPriceFileUrl } from '../src/providers/tcgplayer.js';
import { assertProvider } from '../src/providers/provider.js';
import { searchText } from '../src/providers/index.js';
import { PRINTINGS, fmtNum, printingFromFinish } from '../src/cards.js';
import { confidence, numFromAi, REVIEW_THRESHOLD, scoreCards } from '../src/match.js';
import { migrate } from '../src/settings.js';

const raw = JSON.parse(readFileSync(new URL('./fixtures/tcgcsv-sample.json', import.meta.url), 'utf8'));
const file = buildPriceFile({ ...raw, built: '2026-11-19T21:40:00.000Z' });
const row = (id) => file.cards.find((r) => r[0] === id);

describe('TCGplayer price file: names and numbers', () => {
  it('maps every TCGplayer printing name onto the app printing keys', () => {
    expect(printingKey('Normal')).toBe('normal');
    expect(printingKey('Holofoil')).toBe('holofoil');
    expect(printingKey('Reverse Holofoil')).toBe('reverseHolofoil');
    expect(printingKey('1st Edition Holofoil')).toBe('1stEditionHolofoil');
    expect(printingKey('1st Edition Normal')).toBe('1stEditionNormal');
    expect(printingKey('Unlimited Holofoil')).toBe('unlimitedHolofoil');
    expect(printingKey('1st Edition')).toBe('1stEdition');
    expect(printingKey('Unlimited')).toBe('unlimited');
    for (const name of ['Normal', 'Holofoil', 'Reverse Holofoil', '1st Edition Holofoil', 'Unlimited Holofoil']) {
      expect(PRINTINGS[printingKey(name)]).toBeTruthy();
    }
  });

  it('turns TCGplayer set names into the names players use', () => {
    expect(cleanSetName('SV01: Scarlet & Violet Base Set')).toBe('Scarlet & Violet Base Set');
    expect(cleanSetName('SV: Scarlet & Violet 151')).toBe('Scarlet & Violet 151');
    expect(cleanSetName('SWSH07: Evolving Skies')).toBe('Evolving Skies');
    expect(cleanSetName('ME07: Flowing Fists')).toBe('Flowing Fists');
    expect(cleanSetName('SM - Burning Shadows')).toBe('Burning Shadows');
    expect(cleanSetName('XY - Evolutions')).toBe('Evolutions');
    expect(cleanSetName('Base Set (Shadowless)')).toBe('Base Set (Shadowless)');
    expect(cleanSetName("McDonald's Promos 2019")).toBe("McDonald's Promos 2019");
    expect(cleanSetName('Crown Zenith: Galarian Gallery')).toBe('Crown Zenith: Galarian Gallery');
  });

  it('drops an appended collector number but keeps variant notes', () => {
    expect(cleanCardName('Charizard ex - 199/165')).toBe('Charizard ex');
    expect(cleanCardName('Pikachu - SWSH039')).toBe('Pikachu');
    expect(cleanCardName('Mr. Mime - 6/64 (Jungle Holo)')).toBe('Mr. Mime (Jungle Holo)');
    expect(cleanCardName('Lugia VSTAR (Secret) (202)')).toBe('Lugia VSTAR (Secret) (202)');
    expect(cleanCardName('Porygon-Z')).toBe('Porygon-Z');
  });

  it('splits collector numbers the way the cards print them', () => {
    expect(splitNumber('025/198')).toEqual({ number: '025', total: 198 });
    expect(splitNumber('TG05/TG30')).toEqual({ number: 'TG05', total: 30 });
    expect(splitNumber('SV049/SV094')).toEqual({ number: 'SV049', total: 94 });
    expect(splitNumber('SWSH050')).toEqual({ number: 'SWSH050', total: '' });
    expect(splitNumber('')).toEqual({ number: '', total: '' });
  });
});

describe('TCGplayer price file: building it from tcgcsv', () => {
  it('keeps single cards only (no packs, boxes or code cards)', () => {
    const ids = file.cards.map((r) => r[0]);
    expect(ids).toContain(450289);
    expect(ids).not.toContain(283388); // booster pack
    expect(ids).not.toContain(453523); // code card
    expect(ids).not.toContain(900901); // tin
    expect(file.groups.map((g) => g[0])).not.toContain(999); // a set with no singles is left out
  });

  it('stores only the Market Price, per printing (no listing prices)', () => {
    const f = rowToFields(file, row(451799));
    expect(f.prices).toEqual({ normal: { market: 0.05 }, reverseHolofoil: { market: 0.12 } });
    expect(JSON.stringify(file)).not.toMatch(/lowPrice|midPrice|highPrice|directLow/);
    expect(JSON.stringify(file.cards)).not.toContain('380'); // Base Set Charizard's lowest listing is not in the file
  });

  it('keeps a printing with no market price, without making one up', () => {
    const f = rowToFields(file, row(900103));
    expect(f.prices.normal.market).toBe(0.31);
    expect(f.prices.reverseHolofoil).toEqual({ market: undefined });
  });

  it('builds the Card fields the app uses', () => {
    const f = rowToFields(file, row(900101));
    expect(f).toMatchObject({
      name: 'Charizard ex', number: '199', printedTotal: 165, setName: 'Scarlet & Violet 151', setCode: 'MEW',
      releaseDate: '2023/09/22', rarity: 'Special Illustration Rare', updatedAt: '2026/11/19',
      img: 'https://tcgplayer-cdn.tcgplayer.com/product/900101_200w.jpg',
      imgLarge: 'https://tcgplayer-cdn.tcgplayer.com/product/900101_in_1000x1000.jpg',
      tcgUrl: 'https://www.tcgplayer.com/product/900101',
    });
    expect(f.prices.holofoil.market).toBe(95.31);
    expect(fmtNum(f)).toBe('199/165');
  });

  it('lists the newest sets first and survives a JSON round trip', () => {
    expect(file.groups.map((g) => g[1])).toEqual(['Scarlet & Violet 151', 'Silver Tempest', 'Base Set', 'Base Set (Shadowless)']);
    expect(checkPriceFile(JSON.parse(JSON.stringify(file)))).toBeTruthy();
    expect(() => checkPriceFile({ v: 99 })).toThrow(/version/);
  });
});

describe('TCGplayer provider', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(file)) }));
    vi.stubGlobal('fetch', fetchMock);
    setPriceFileUrl('https://ezscanner.test/prices/cards.json');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('follows the PriceProvider contract', () => {
    expect(assertProvider(tcgplayer)).toBe(true);
  });

  it('finds the exact card from what the AI read, and loads the file once', async () => {
    const num = numFromAi('199', '165');
    const cards = await tcgplayer.findCards({ num, name: 'Charizard ex' });
    expect(cards.map((c) => c.sourceId)).toEqual(['900101']);
    await tcgplayer.findCards({ num: numFromAi('25', '165'), name: 'Pikachu' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const hint = { name: 'Charizard ex', num, setName: 'Scarlet & Violet 151', setCode: 'MEW', text: 'Charizard ex MEW Scarlet & Violet 151' };
    const scored = scoreCards(cards, hint);
    expect(confidence(scored, 'high')).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(scored[0].c.prices.holofoil.market).toBe(95.31);
  });

  it('matches 025 and 25 the same way', async () => {
    const cards = await tcgplayer.findCards({ num: numFromAi('25', '165'), name: 'Pikachu' });
    expect(cards[0].name).toBe('Pikachu');
    expect(printingFromFinish(cards[0], 'non_holo', false)).toBe('normal');
  });

  it('still finds the card when the AI misreads the total', async () => {
    const cards = await tcgplayer.findCards({ num: numFromAi('138', '159'), name: 'Lugia V' });
    expect(cards.map((c) => c.name)).toContain('Lugia V');
  });

  it('falls back to the name when the number is wrong', async () => {
    const cards = await tcgplayer.findCards({ num: numFromAi('999', '195'), name: 'Fletchling' });
    expect(cards.map((c) => c.name)).toEqual(['Fletchling']);
  });

  it('sends lookalike versions to review instead of guessing (Base Set vs Shadowless)', async () => {
    const num = numFromAi('4', '102');
    const cards = await tcgplayer.findCards({ num, name: 'Charizard' });
    expect(cards.map((c) => c.setName).sort()).toEqual(['Base Set', 'Base Set (Shadowless)']);
    const scored = scoreCards(cards, { name: 'Charizard', num, text: 'Charizard' });
    expect(confidence(scored, 'high')).toBeLessThan(REVIEW_THRESHOLD);
  });

  it('typed search finds variants by name, plain name first', async () => {
    const cards = await searchText(tcgplayer, 'lugia v');
    expect(cards[0].name).toBe('Lugia V');
    expect(cards.map((c) => c.name)).toEqual(expect.arrayContaining(['Lugia V (Full Art)', 'Lugia V (Alternate Full Art)', 'Lugia VSTAR (Secret) (202)']));
    const byNumber = await searchText(tcgplayer, 'lugia 186/195');
    expect(byNumber[0].name).toBe('Lugia V (Alternate Full Art)');
    expect(byNumber[0].prices.holofoil.market).toBe(210.55);
  });

  it('refreshing asks the server for a newer file', async () => {
    await tcgplayer.findCards({ num: null, name: 'pikachu' });
    const [card] = await tcgplayer.getByIds(['900103', 'missing']);
    expect(card.id).toBe('tcgplayer:900103');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toEqual({ cache: 'no-cache' });
  });

  it('explains what to do when the price file has not been published yet', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    await expect(tcgplayer.findCards({ num: null, name: 'pikachu' })).rejects.toThrow(/Deploy to GitHub Pages|npm run prices/);
  });
});

describe('settings move to TCGplayer prices once', () => {
  it('switches phones that saved the old default', () => {
    expect(migrate({ provider: 'pokemontcgio', model: 'claude-haiku-5-5' })).toMatchObject({ provider: 'tcgplayer', migrated: 1, model: 'claude-haiku-5-5' });
  });
  it('respects a choice made after the switch', () => {
    expect(migrate({ provider: 'pokemontcgio', migrated: 1 }).provider).toBe('pokemontcgio');
  });
});
