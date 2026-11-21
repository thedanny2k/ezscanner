#!/usr/bin/env node
// probe-tcgplayer.mjs — one-off check before building Near Mint prices read from TCGplayer's site.
//
// TCGplayer's product pages load their prices from TCGplayer's own (undocumented) web services.
// This script asks a few of them about the cards you name, ONE request per second, and saves
// exactly what came back, so we can see which one gives the Near Mint Market Price shown on the
// product page, and whether TCGplayer answers requests from a server at all.
//
// Usage (Mac):            node scripts/probe-tcgplayer.mjs 42382 451396
// Usage (GitHub Actions): Actions -> "Probe TCGplayer prices" -> Run workflow
// Output: a summary in the terminal, and everything in prices/probe-tcgplayer.json (not committed).
//
// Note: TCGplayer's terms don't allow automated collection without permission. This is a handful
// of requests for an in-house check; nothing here hides who is asking.

import { mkdir, writeFile } from 'node:fs/promises';

const UA = `EZScanner in-house price check (+https://github.com/${process.env.GITHUB_REPOSITORY || 'thedanny2k/ezscanner'})`;
const PAUSE_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Where TCGplayer's product page gets its numbers (as seen in its web app), plus the page itself. */
const SOURCES = {
  pricepoints: (id) => `https://mpapi.tcgplayer.com/v2/product/${id}/pricepoints`,
  details: (id) => `https://mp-search-api.tcgplayer.com/v2/product/${id}/details`,
  history: (id) => `https://infinite-api.tcgplayer.com/price/history/${id}/detailed?range=month`,
  page: (id) => `https://www.tcgplayer.com/product/${id}`,
};

async function fetchOne(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, text/html;q=0.8' }, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { url, status: res.status, ms: Date.now() - started, type: res.headers.get('content-type') || '', bytes: text.length, json, text: json ? undefined : text.slice(0, 3000) };
  } catch (e) {
    return { url, status: 0, ms: Date.now() - started, error: e.message };
  }
}

/** Best guess at "Near Mint market price per printing" from each answer, for a quick look. */
function summarize(name, r) {
  const j = r.json;
  if (!j) return r.error ? `error: ${r.error}` : `HTTP ${r.status}, ${r.type.split(';')[0]}, ${r.bytes} bytes` + (/market price/i.test(r.text || '') ? ' (page text mentions "Market Price")' : '');
  const list = (x) => (Array.isArray(x) ? x : Array.isArray(x?.result) ? x.result : Array.isArray(x?.results) ? x.results : Array.isArray(x?.data) ? x.data : []);
  if (name === 'history') {
    const nm = list(j).filter((s) => /near mint/i.test(s.condition || ''));
    if (!nm.length) return `HTTP ${r.status}, JSON, no "Near Mint" rows (keys: ${Object.keys(j).slice(0, 8).join(', ')})`;
    return nm.map((s) => {
      const b = (s.buckets || []).slice().sort((a, c) => String(c.bucketStartDate).localeCompare(String(a.bucketStartDate)))[0] || {};
      return `${s.variant || '?'} NM: market ${b.marketPrice ?? '?'} (bucket ${b.bucketStartDate || '?'})`;
    }).join(' | ');
  }
  if (name === 'pricepoints') {
    const rows = list(j);
    return rows.length ? rows.map((p) => `${p.printingType || p.printing || '?'}: market ${p.marketPrice ?? '?'}`).join(' | ') : `HTTP ${r.status}, JSON (keys: ${Object.keys(j).slice(0, 8).join(', ')})`;
  }
  return `HTTP ${r.status}, JSON (keys: ${Object.keys(j).slice(0, 10).join(', ')})`;
}

async function main() {
  const ids = process.argv.slice(2).filter((x) => /^\d+$/.test(x));
  if (!ids.length) ids.push('42382', '451396');
  const out = { ranAt: new Date().toISOString(), where: process.env.GITHUB_ACTIONS ? 'GitHub Actions (a server)' : 'this computer', ids, results: {} };
  for (const id of ids) {
    console.log(`\nTCGplayer product ${id}  (compare with https://www.tcgplayer.com/product/${id})`);
    out.results[id] = {};
    for (const [name, make] of Object.entries(SOURCES)) {
      const r = await fetchOne(make(id));
      out.results[id][name] = r;
      console.log(`  ${name.padEnd(11)} ${summarize(name, r)}`);
      await sleep(PAUSE_MS);
    }
  }
  await mkdir('prices', { recursive: true });
  await writeFile('prices/probe-tcgplayer.json', JSON.stringify(out, null, 1));
  console.log(`\nSaved everything to prices/probe-tcgplayer.json (${out.where}). Send that file to Claude.`);
}

main().catch((e) => {
  console.error('probe failed:', e.message);
  process.exit(1);
});
