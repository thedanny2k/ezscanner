// tcg-price — TCGplayer's Near Mint market price for each card, read from the same place
// TCGplayer's product page gets it ("Price Points → Market Price"). Used in-house by EZScanner.
// Decision record: docs/decisions/0008-near-mint-prices-from-tcgplayer-site.md
//
//   GET /functions/v1/tcg-price?ids=246728,676096
//   -> { at: "2026-11-21T08:40:00Z",
//        prices: { "246728": { normal: null, foil: 464.17 }, ... },
//        failed: ["123"] }
//
// TCGplayer answers with one market price per printing type: "Normal" and "Foil". The app decides
// which of the card's versions each one belongs to (src/livePrices.js).
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function → Via Editor, name
// "tcg-price", paste this file, then turn OFF "Verify JWT" (it returns only public prices).
// CLI alternative: supabase functions deploy tcg-price --no-verify-jwt
//
// Kept gentle on purpose: at most 50 cards per call, 4 requests to TCGplayer at a time, each card
// cached for 10 minutes, and requests say who is asking.

const TCGPLAYER = (id: string) => `https://mpapi.tcgplayer.com/v2/product/${id}/pricepoints`;
const UA = 'EZScanner in-house price check (+https://github.com/thedanny2k/ezscanner)';
const MAX_IDS = 50;
const PARALLEL = 4;
const CACHE_MS = 10 * 60 * 1000;

const env = (name: string) => (globalThis as any).Deno?.env?.get?.(name) || '';
const ALLOWED = (env('ALLOWED_ORIGINS') || 'https://thedanny2k.github.io').split(',').map((s: string) => s.trim()).filter(Boolean);

type Price = { normal: number | null; foil: number | null };
const cache = new Map<string, { at: number; price: Price }>();

/** TCGplayer's pricepoints answer -> { normal, foil } (null when TCGplayer has no market price). */
export function normalize(rows: unknown): Price {
  const out: Price = { normal: null, foil: null };
  for (const r of Array.isArray(rows) ? rows : []) {
    const type = String((r as any)?.printingType || '').toLowerCase();
    const v = Number((r as any)?.marketPrice);
    const price = (r as any)?.marketPrice == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
    if (type === 'normal') out.normal = price;
    else if (type === 'foil') out.foil = price;
  }
  return out;
}

function allowOrigin(origin: string | null): string {
  if (!origin) return '';
  if (ALLOWED.includes(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin; // testing on your computer
  return '';
}

function reply(body: unknown, status: number, origin: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

async function priceOf(id: string, fetchImpl: typeof fetch): Promise<Price> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.price;
  const res = await fetchImpl(TCGPLAYER(id), { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`TCGplayer answered ${res.status}`);
  const price = normalize(await res.json());
  cache.set(id, { at: Date.now(), price });
  return price;
}

export async function handle(req: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const origin = allowOrigin(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } });
  }
  if (req.method !== 'GET') return reply({ error: 'Use GET ?ids=…' }, 405, origin);
  if (req.headers.get('Origin') && !origin) return reply({ error: 'This site may not use this price service.' }, 403, '');

  const raw = new URL(req.url).searchParams.get('ids') || '';
  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => /^\d{1,9}$/.test(s)))];
  if (!ids.length) return reply({ error: 'Pass TCGplayer product ids: ?ids=246728,676096' }, 400, origin);
  if (ids.length > MAX_IDS) return reply({ error: `At most ${MAX_IDS} cards per call.` }, 400, origin);

  const prices: Record<string, Price> = {};
  const failed: string[] = [];
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        prices[id] = await priceOf(id, fetchImpl);
      } catch (_e) {
        failed.push(id);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, ids.length) }, worker));
  return reply({ at: new Date().toISOString(), prices, failed }, 200, origin);
}

/** For tests. */
export const _cache = cache;

if ((globalThis as any).Deno?.serve) (globalThis as any).Deno.serve((req: Request) => handle(req));
