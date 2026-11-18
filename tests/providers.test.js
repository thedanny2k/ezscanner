import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROVIDERS, getProvider, DEFAULT_PROVIDER } from '../src/providers/index.js';
import { assertProvider } from '../src/providers/provider.js';
import { fromTcgdex } from '../src/providers/tcgdex.js';
import { fromPokemonTcgIo } from '../src/providers/pokemontcgio.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('price providers', () => {
  it.each(Object.keys(PROVIDERS))('%s follows the PriceProvider contract', (id) => {
    expect(assertProvider(PROVIDERS[id])).toBe(true);
  });

  it('falls back to the default provider for unknown ids', () => {
    expect(getProvider('nope').id).toBe(DEFAULT_PROVIDER);
  });

  it('Scrydex says plainly that it is not built yet', async () => {
    await expect(PROVIDERS.scrydex.findCards({ num: null, name: 'Pikachu' })).rejects.toThrow(/not built yet/);
  });
});

describe('both providers produce the same Card for the same card', () => {
  const a = fromTcgdex(fixture('tcgdex-card.json'));
  const b = fromPokemonTcgIo(fixture('pokemontcgio-card.json'));

  it('maps TCGdex variant names onto the app printing keys', () => {
    expect(a.prices.normal.market).toBe(0.18);
    expect(a.prices.reverseHolofoil.market).toBe(0.52);
    expect(a.imgLarge).toMatch(/\/high\.webp$/);
  });

  it('agrees on the fields the app relies on', () => {
    for (const key of ['name', 'printedTotal', 'setName']) expect(a[key]).toEqual(b[key]);
    expect(Object.keys(a.prices).sort()).toEqual(Object.keys(b.prices).sort());
    expect(a.prices.normal.market).toBe(b.prices.normal.market);
    expect(a.id).toBe('tcgdex:sv01-025');
    expect(b.id).toBe('pokemontcgio:sv1-25');
  });
});
