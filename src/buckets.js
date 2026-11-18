// buckets.js — a bucket is one lot or container of cards. This file holds the money math.
// Pure functions; storage lives in src/storage/.

import { marketOf } from './cards.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** A new, empty bucket. */
export function makeBucket({ name, offerPct = 70 } = {}) {
  return {
    id: crypto.randomUUID(),
    name: name || `Lot · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    createdAt: new Date().toISOString(),
    notes: '',
    paid: null,
    offerPct: clamp(Number(offerPct) || 0, 0, 100),
    minValue: 0,
    items: [],
  };
}

/** Only confirmed cards count toward money. "Needs review" cards wait for a person. */
export const counts = (item) => item.status === 'done';

/** Offer for one card at the bucket's %: unconfirmed cards and cards under the minimum get $0. */
export function itemOffer(bucket, item) {
  const m = marketOf(item);
  if (!counts(item) || typeof m !== 'number' || m < (bucket.minValue || 0)) return 0;
  return (m * (Number(bucket.offerPct) || 0)) / 100;
}

/**
 * Everything the bucket screen shows.
 * market   = sum of TCGplayer market prices of confirmed cards
 * eligible = market of cards at or above the minimum value
 * offer    = eligible × offer %
 * profit   = market − paid
 */
export function bucketStats(bucket) {
  let market = 0;
  let eligible = 0;
  let under = 0;
  let underValue = 0;
  let pending = 0;
  let review = 0;
  let reviewValue = 0;
  let failed = 0;
  const min = bucket.minValue || 0;
  for (const it of bucket.items) {
    if (it.status === 'reading' || it.status === 'lookup') pending++;
    if (it.status === 'failed') failed++;
    const m = marketOf(it);
    if (it.status === 'review') {
      review++;
      if (typeof m === 'number') reviewValue += m;
    }
    if (!counts(it) || typeof m !== 'number') continue;
    market += m;
    if (m >= min) eligible += m;
    else {
      under++;
      underValue += m;
    }
  }
  const pct = clamp(Number(bucket.offerPct) || 0, 0, 100);
  const paid = typeof bucket.paid === 'number' ? bucket.paid : null;
  return {
    count: bucket.items.length,
    pending,
    review,
    reviewValue,
    failed,
    market,
    eligible,
    under,
    underValue,
    pct,
    offer: (eligible * pct) / 100,
    paid,
    profit: paid == null ? null : market - paid,
    paidPct: paid == null || !market ? null : (paid / market) * 100,
  };
}

/** Offer % that produces a given dollar offer (the calculator works both ways). */
export function pctForOffer(bucket, offerDollars) {
  const { eligible } = bucketStats(bucket);
  if (!eligible) return 0;
  return clamp(Math.round(((offerDollars / eligible) * 100) * 10) / 10, 0, 100);
}
