#!/usr/bin/env node
// build-prices.mjs — downloads TCGplayer's English Pokémon price guide from tcgcsv.com and writes
// <outDir>/cards.json for the app (format: src/providers/tcgplayer-data.js). Only TCGplayer's
// Market Price is kept, per printing.
//
// Runs once a day in .github/workflows/pages.yml, after tcgcsv's ~20:00 UTC refresh.
// tcgcsv asks callers to sync at most once a day, pause ~100 ms between requests, send a real
// User-Agent, and never call it from a user-facing app (https://tcgcsv.com/docs). This script
// does all four: phones only ever read the file it publishes.
//
// Usage:
//   node scripts/build-prices.mjs <outDir> [--reuse <url of the live cards.json>] [--limit <N>]
//   --reuse  If the live file already has tcgcsv's latest data, copy it instead of downloading
//            ~450 files again (pushes during the day). If tcgcsv is down or a set fails to
//            download, keep the live file so the site still deploys with yesterday's prices.
//   --limit  Only the N newest sets, for a quick try on your computer.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildPriceFile, checkPriceFile, PRICE_FILE_VERSION } from '../src/providers/tcgplayer-data.js';

const BASE = process.env.TCGCSV_BASE || 'https://tcgcsv.com'; // overridable for tests
const CATEGORY = 3; // Pokémon, English. (Japanese is a separate category.)
const REPO = process.env.GITHUB_REPOSITORY || 'thedanny2k/ezscanner';
const UA = `EZScanner/0.3 (+https://github.com/${REPO})`;
const PAUSE_MS = 120;
const MIN_CARDS = Number(process.env.PRICES_MIN_CARDS || 5000); // a full build has far more; fewer means tcgcsv sent something odd

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[prices]', ...a);

function args(argv) {
  const out = { dir: '', reuse: '', limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--reuse') out.reuse = argv[++i] || '';
    else if (argv[i] === '--limit') out.limit = parseInt(argv[++i], 10) || 0;
    else if (!out.dir) out.dir = argv[i];
  }
  if (!out.dir) throw new Error('Usage: node scripts/build-prices.mjs <outDir> [--reuse <url>] [--limit <N>]');
  return out;
}

async function get(url, as = 'json') {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(2000 * attempt);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: as === 'json' ? 'application/json' : 'text/plain' }, signal: AbortSignal.timeout(30000) });
      if (res.status === 404) return null; // tcgcsv has no file for this set (yet)
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return as === 'json' ? await res.json() : await res.text();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** tcgcsv's last-updated.txt -> ISO time, or now if it can't be read. */
async function tcgcsvUpdated() {
  try {
    const text = String((await get(`${BASE}/last-updated.txt`, 'text')) || '').trim();
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch (e) {
    log('could not read last-updated.txt:', e.message);
    return '';
  }
}

async function liveFile(url) {
  if (!url) return null;
  try {
    const json = await get(url);
    if (!json) { log('no live file yet (first deploy)'); return null; }
    const f = checkPriceFile(json);
    log(`live file: ${f.cards.length} cards, TCGplayer data from ${f.updated}`);
    return f;
  } catch (e) {
    log('no usable live file:', e.message);
    return null;
  }
}

async function download(limit) {
  const groups = ((await get(`${BASE}/tcgplayer/${CATEGORY}/groups`)) || {}).results || [];
  if (!groups.length) throw new Error('tcgcsv returned no sets');
  const picked = [...groups].sort((a, b) => String(b.publishedOn).localeCompare(String(a.publishedOn))).slice(0, limit || groups.length);
  log(`${picked.length} of ${groups.length} sets`);
  const products = {};
  const prices = {};
  const failed = [];
  for (const [i, g] of picked.entries()) {
    try {
      products[g.groupId] = ((await get(`${BASE}/tcgplayer/${CATEGORY}/${g.groupId}/products`)) || {}).results || [];
      await sleep(PAUSE_MS);
      prices[g.groupId] = ((await get(`${BASE}/tcgplayer/${CATEGORY}/${g.groupId}/prices`)) || {}).results || [];
      await sleep(PAUSE_MS);
    } catch (e) {
      failed.push(`${g.name} (${e.message})`);
      delete products[g.groupId];
    }
    if ((i + 1) % 25 === 0) log(`${i + 1}/${picked.length} sets`);
  }
  return { groups: picked.filter((g) => products[g.groupId]), products, prices, failed };
}

async function write(dir, file) {
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, 'cards.json');
  const text = JSON.stringify(file);
  await writeFile(out, text);
  log(`wrote ${out}: ${file.groups.length} sets, ${file.cards.length} cards, ${(text.length / 1e6).toFixed(1)} MB, TCGplayer data from ${file.updated}`);
}

async function main() {
  const opt = args(process.argv.slice(2));
  const updated = await tcgcsvUpdated();
  const live = await liveFile(opt.reuse);

  if (live && live.v === PRICE_FILE_VERSION && updated && live.updated === updated && !opt.limit) {
    log('live file already has the latest TCGplayer data; reusing it (no download)');
    return write(opt.dir, live);
  }

  let file;
  try {
    const raw = await download(opt.limit);
    if (raw.failed.length) {
      log(`${raw.failed.length} set(s) failed:\n  ` + raw.failed.join('\n  '));
      if (live) throw new Error('some sets failed to download');
      if (raw.failed.length > raw.groups.length * 0.05) throw new Error('too many sets failed to download');
    }
    file = buildPriceFile({ groups: raw.groups, products: raw.products, prices: raw.prices, updated: updated || new Date().toISOString() });
    if (!opt.limit && file.cards.length < MIN_CARDS) throw new Error(`only ${file.cards.length} cards came back`);
  } catch (e) {
    if (!live) throw e;
    log(`${e.message}; keeping the live file (prices from ${live.updated}) so the site still deploys`);
    return write(opt.dir, live);
  }
  return write(opt.dir, file);
}

main().catch((e) => {
  console.error('[prices] FAILED:', e.message);
  process.exit(1);
});
