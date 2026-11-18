import { describe, expect, it } from 'vitest';
import { bucketStats, itemOffer, makeBucket, pctForOffer } from '../src/buckets.js';
import { defaultPrinting, fmtNum, printingFromFinish } from '../src/cards.js';

const pikachu = { name: 'Pikachu', number: '25', printedTotal: 198, setName: 'Scarlet & Violet', setCode: 'SVI',
  prices: { normal: { market: 0.18 }, reverseHolofoil: { market: 0.52 } } };
const item = (printing) => ({ id: crypto.randomUUID(), status: 'done', card: pikachu, printing });

function lot() {
  const b = makeBucket({ name: 'Test lot', offerPct: 70 });
  b.items = [item('normal'), item('normal'), item('reverseHolofoil')];
  return b;
}

describe('bucket math', () => {
  it('totals market value', () => {
    expect(bucketStats(lot()).market).toBeCloseTo(0.88, 5);
  });

  it('offer = eligible market × offer %', () => {
    const b = lot();
    b.offerPct = 80;
    expect(bucketStats(b).offer).toBeCloseTo(0.704, 5);
  });

  it('works backwards from a dollar offer to a %', () => {
    expect(pctForOffer(lot(), 0.44)).toBe(50);
  });

  it('skips cards under the minimum value', () => {
    const b = lot();
    b.offerPct = 50;
    b.minValue = 0.2;
    const s = bucketStats(b);
    expect(s.under).toBe(2);
    expect(s.underValue).toBeCloseTo(0.36, 5);
    expect(s.offer).toBeCloseTo(0.26, 5);
    expect(itemOffer(b, b.items[0])).toBe(0);
  });

  it('profit = market − paid', () => {
    const b = lot();
    b.paid = 0.5;
    const s = bucketStats(b);
    expect(s.profit).toBeCloseTo(0.38, 5);
    expect(s.paidPct).toBeCloseTo(56.818, 2);
  });

  it('leaves cards that need review out of the money until a person confirms them', () => {
    const b = lot();
    b.items[2].status = 'review'; // the $0.52 reverse holo
    const s = bucketStats(b);
    expect(s.review).toBe(1);
    expect(s.reviewValue).toBeCloseTo(0.52, 5);
    expect(s.market).toBeCloseTo(0.36, 5);
    expect(itemOffer(b, b.items[2])).toBe(0);
    b.items[2].status = 'done';
    expect(bucketStats(b).market).toBeCloseTo(0.88, 5);
  });
});

describe('printings', () => {
  it('picks the version the AI saw', () => {
    expect(printingFromFinish(pikachu, 'reverse_holo', false)).toBe('reverseHolofoil');
    expect(printingFromFinish(pikachu, 'non_holo', false)).toBe('normal');
    expect(printingFromFinish(pikachu, 'unknown', false)).toBe(defaultPrinting(pikachu));
  });

  it('prefers 1st edition when the AI saw the stamp', () => {
    const base = { prices: { '1stEditionHolofoil': { market: 8800 }, unlimitedHolofoil: { market: 412 } } };
    expect(printingFromFinish(base, 'holo', true)).toBe('1stEditionHolofoil');
    expect(printingFromFinish(base, 'holo', false)).toBe('unlimitedHolofoil');
  });

  it('formats collector numbers', () => {
    expect(fmtNum(pikachu)).toBe('25/198');
    expect(fmtNum({ number: 'TG05', printedTotal: 30 })).toBe('TG05/TG30');
    expect(fmtNum({ number: 'SWSH050', printedTotal: 307 })).toBe('SWSH050');
  });
});
