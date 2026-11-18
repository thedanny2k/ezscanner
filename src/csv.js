// csv.js — bucket export and import. Exports open cleanly in Excel / Google Sheets
// and can be imported back on another phone (cards are refetched with today's prices).

import { PRINTINGS, fmtNum, marketOf } from './cards.js';
import { itemOffer } from './buckets.js';

export const CSV_HEAD = ['Bucket', 'Card', 'Set', 'Set Code', 'Number', 'Version', 'TCGplayer Market', 'Offer', 'Offer %',
  'Bucket Paid', 'Source', 'Source ID', 'Version Key', 'Added'];

const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
const money = (v) => (Math.round(v * 100) / 100).toFixed(2);

/** One row per identified card, oldest first. */
export function bucketToCsv(bucket) {
  const rows = [CSV_HEAD];
  bucket.items
    .filter((it) => it.card)
    .slice()
    .reverse()
    .forEach((it) => {
      const m = marketOf(it);
      rows.push([
        bucket.name, it.card.name, it.card.setName, it.card.setCode, fmtNum(it.card), PRINTINGS[it.printing] || it.printing,
        typeof m === 'number' ? m.toFixed(2) : '', money(itemOffer(bucket, it)), bucket.offerPct,
        bucket.paid != null ? money(bucket.paid) : '', it.card.source, it.card.sourceId, it.printing,
        it.addedAt || '',
      ]);
    });
  return rows.map((r) => r.map(q).join(',')).join('\n');
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/**
 * Reads an exported CSV back into what's needed to rebuild the bucket.
 * @returns {{name:string, offerPct:number|null, paid:number|null, entries:{source:string, sourceId:string, printing:string}[]}}
 */
export function readExport(text) {
  const rows = parseCsv(text);
  const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name.toLowerCase());
  const iSrc = col('Source');
  const iId = col('Source ID');
  if (iId < 0) throw new Error('This CSV was not exported from the app (no "Source ID" column).');
  const num = (v) => {
    const n = parseFloat(String(v || '').replace(/[$,%\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const first = rows[0] || [];
  return {
    name: first[col('Bucket')] || 'Imported bucket',
    offerPct: num(first[col('Offer %')]),
    paid: num(first[col('Bucket Paid')]),
    entries: rows.map((r) => ({ source: iSrc >= 0 ? r[iSrc] : 'pokemontcgio', sourceId: r[iId], printing: r[col('Version Key')] || '' })),
  };
}
