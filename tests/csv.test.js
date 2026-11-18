import { describe, expect, it } from 'vitest';
import { bucketToCsv, parseCsv, readExport } from '../src/csv.js';
import { makeBucket } from '../src/buckets.js';

const card = { source: 'pokemontcgio', sourceId: 'sv1-25', name: 'Pikachu, "the" mouse', number: '25', printedTotal: 198,
  setName: 'Scarlet & Violet', setCode: 'SVI', prices: { normal: { market: 0.18 } } };

describe('CSV', () => {
  it('parses quoted fields, escaped quotes and CRLF', () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\n')).toEqual([['a', 'b,c', 'd "e"'], ['1', '2', '3']]);
  });

  it('round-trips a bucket through export and import', () => {
    const b = makeBucket({ name: 'Mike, binder', offerPct: 75 });
    b.paid = 12.5;
    b.items = [{ id: 'x', status: 'done', card, printing: 'normal', addedAt: '2026-11-16T00:00:00Z' }];
    const back = readExport(bucketToCsv(b));
    expect(back.name).toBe('Mike, binder');
    expect(back.offerPct).toBe(75);
    expect(back.paid).toBe(12.5);
    expect(back.entries).toEqual([{ source: 'pokemontcgio', sourceId: 'sv1-25', printing: 'normal' }]);
  });

  it('rejects CSVs from somewhere else', () => {
    expect(() => readExport('Name,Price\nPikachu,1')).toThrow(/Source ID/);
  });
});
