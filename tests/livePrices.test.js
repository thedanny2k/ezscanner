import { describe, expect, it, vi } from 'vitest';
import { applyLive, createLiveClient, isLive, liveKeyFor, refreshItemsLive } from '../src/livePrices.js';
import { marketOf } from '../src/cards.js';
import { handle, normalize, _cache } from '../supabase/functions/tcg-price/index.ts';

// Answers from TCGplayer's pricepoints, as the probe on 2026-11-21 saw them (Mega Greninja ex 116/086).
const GRENINJA_PP = [
  { printingType: 'Normal', marketPrice: null, buylistMarketPrice: null, listedMedianPrice: null },
  { printingType: 'Foil', marketPrice: 103.02, buylistMarketPrice: null, listedMedianPrice: 125 },
];

const card = (prices, over = {}) => ({ id: 'tcgplayer:693517', source: 'tcgplayer', sourceId: '693517', name: 'Mega Greninja ex', prices, ...over });

describe('which version a live price belongs to', () => {
  it('a card with one foil version takes the Foil price (ex, full art, alt art, SIR)', () => {
    expect(liveKeyFor(card({ holofoil: { market: 98.5 } }), 'foil')).toBe('holofoil');
    expect(liveKeyFor(card({ holofoil: {} }), 'normal')).toBe('');
  });

  it('a common with Normal + Reverse Holo is clear too', () => {
    const c = card({ normal: {}, reverseHolofoil: {} });
    expect(liveKeyFor(c, 'normal')).toBe('normal');
    expect(liveKeyFor(c, 'foil')).toBe('reverseHolofoil');
  });

  it('Holofoil AND Reverse Holo: unclear, so no guess', () => {
    expect(liveKeyFor(card({ holofoil: {}, reverseHolofoil: {} }), 'foil')).toBe('');
    expect(liveKeyFor(card({ '1stEditionHolofoil': {}, unlimitedHolofoil: {} }), 'foil')).toBe('');
  });
});

describe('applying a live price', () => {
  it('replaces the daily price and keeps it next to the live one', () => {
    const { card: c, applied } = applyLive(card({ holofoil: { market: 98.5 } }), normalize(GRENINJA_PP), '2026-11-21T08:40:00Z');
    expect(applied).toEqual(['holofoil']);
    expect(c.prices.holofoil).toEqual({ market: 103.02, daily: 98.5, live: true });
    expect(c.liveAt).toBe('2026-11-21T08:40:00Z');
    expect(isLive({ card: c, printing: 'holofoil' })).toBe(true);
    expect(marketOf({ card: c, printing: 'holofoil' })).toBe(103.02);
  });

  it('a second live update keeps the original daily price', () => {
    const once = applyLive(card({ holofoil: { market: 98.5 } }), { foil: 103.02 }, 'a').card;
    expect(applyLive(once, { foil: 101 }, 'b').card.prices.holofoil).toEqual({ market: 101, daily: 98.5, live: true });
  });

  it('leaves the card alone when nothing clearly applies', () => {
    const c = card({ holofoil: { market: 5 }, reverseHolofoil: { market: 2 } });
    const r = applyLive(c, { normal: null, foil: 4 }, 'a');
    expect(r.applied).toEqual([]);
    expect(r.card).toBe(c);
    expect(isLive({ card: c, printing: 'holofoil' })).toBe(false);
  });
});

describe('live price client', () => {
  const answer = (prices) => ({ ok: true, status: 200, json: async () => ({ at: '2026-11-21T08:40:00Z', prices, failed: [] }) });

  it('asks once per card, in batches of 50, and remembers answers for a few minutes', async () => {
    let t = 0;
    const fetchImpl = vi.fn(async (url) => {
      const ids = new URL(url).searchParams.get('ids').split(',');
      return answer(Object.fromEntries(ids.map((id) => [id, { normal: null, foil: 1 }])));
    });
    const client = createLiveClient({ url: 'https://x.supabase.co/functions/v1/tcg-price', fetchImpl, now: () => t });
    const ids = Array.from({ length: 120 }, (_, i) => String(1000 + i));
    const r = await client.get([...ids, ids[0]]);
    expect(Object.keys(r.prices)).toHaveLength(120);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await client.get(['1000', '1001']);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // cached
    t = 6 * 60 * 1000;
    await client.get(['1000']);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // expired
    await client.get(['1000'], { fresh: true });
    expect(fetchImpl).toHaveBeenCalledTimes(5); // "Update prices" always asks
  });

  it('is off when no URL is set, and reports failures plainly', async () => {
    expect(createLiveClient({ url: '' }).enabled).toBe(false);
    const down = createLiveClient({ url: 'https://x', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
    await expect(down.get(['1'])).rejects.toThrow(/Couldn't reach/);
    const err = createLiveClient({ url: 'https://x', fetchImpl: async () => ({ ok: false, status: 500 }) });
    await expect(err.get(['1'])).rejects.toThrow(/500/);
  });

  it('prices bucket items live, leaving other sources and failed scans alone', async () => {
    const fetchImpl = vi.fn(async () => answer({ 693517: { normal: null, foil: 103.02 }, 676096: { normal: null, foil: 530.24 } }));
    const client = createLiveClient({ url: 'https://x', fetchImpl });
    const items = [
      { status: 'done', printing: 'holofoil', card: card({ holofoil: { market: 98.5 } }) },
      { status: 'done', printing: 'holofoil', card: card({ holofoil: { market: 520 } }, { sourceId: '676096' }) },
      { status: 'done', printing: 'holofoil', card: card({ holofoil: { market: 3 } }, { source: 'pokemontcgio', sourceId: 'sv1-1' }) },
      { status: 'failed', card: null },
    ];
    const changed = await refreshItemsLive(items, client);
    expect(changed).toHaveLength(2);
    expect(items.map((it) => marketOf(it))).toEqual([103.02, 530.24, 3, undefined]);
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('ids')).toBe('693517,676096');
  });
});

describe('tcg-price function', () => {
  const req = (q, origin = 'https://thedanny2k.github.io', method = 'GET') =>
    new Request(`https://x.supabase.co/functions/v1/tcg-price${q}`, { method, headers: origin ? { Origin: origin } : {} });

  it('turns TCGplayer pricepoints into { normal, foil }', () => {
    expect(normalize(GRENINJA_PP)).toEqual({ normal: null, foil: 103.02 });
    expect(normalize([{ printingType: 'Normal', marketPrice: 0.254 }])).toEqual({ normal: 0.25, foil: null });
    expect(normalize(null)).toEqual({ normal: null, foil: null });
  });

  it('asks TCGplayer once per card, says who is asking, and caches', async () => {
    _cache.clear();
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => GRENINJA_PP }));
    const res = await handle(req('?ids=693517,693517,abc'), fetchImpl);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://thedanny2k.github.io');
    const body = await res.json();
    expect(body.prices).toEqual({ 693517: { normal: null, foil: 103.02 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://mpapi.tcgplayer.com/v2/product/693517/pricepoints');
    expect(fetchImpl.mock.calls[0][1].headers['User-Agent']).toMatch(/EZScanner/);
    await handle(req('?ids=693517'), fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('lists cards TCGplayer refused instead of failing the whole call', async () => {
    _cache.clear();
    const fetchImpl = vi.fn(async (url) => (url.includes('/1/') ? { ok: false, status: 403 } : { ok: true, status: 200, json: async () => GRENINJA_PP }));
    const body = await (await handle(req('?ids=1,2'), fetchImpl)).json();
    expect(body.failed).toEqual(['1']);
    expect(Object.keys(body.prices)).toEqual(['2']);
  });

  it('only serves the app (and your computer), with sane limits', async () => {
    const f = vi.fn();
    expect((await handle(req('?ids=1', 'https://evil.example'), f)).status).toBe(403);
    expect((await handle(req('?ids=1', 'http://localhost:3000'), async () => ({ ok: true, json: async () => [] }))).status).toBe(200);
    expect((await handle(req(''), f)).status).toBe(400);
    expect((await handle(req(`?ids=${Array.from({ length: 51 }, (_, i) => i + 1).join(',')}`), f)).status).toBe(400);
    expect((await handle(req('?ids=1', null, 'OPTIONS'), f)).status).toBe(204);
    expect(f).not.toHaveBeenCalled();
  });
});
