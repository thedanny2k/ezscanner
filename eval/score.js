// eval/score.js — scores one benchmark run.
//
// 1. Fill eval/testset.csv with the right answer for each test card, in the order you'll scan them.
// 2. Scan every card once into an empty bucket (don't use Change during the run).
// 3. Export the bucket as CSV, then run:
//      npm run score -- path/to/export.csv
//
// "Exact" means the right card AND the right version (normal / holo / reverse holo).

import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/csv.js';

const [answersPath, runPath] = process.argv.slice(2);
if (!answersPath || !runPath) {
  console.error('Usage: node eval/score.js eval/testset.csv path/to/export.csv');
  process.exit(1);
}

const table = (path) => {
  const [head, ...rows] = parseCsv(readFileSync(path, 'utf8'));
  const idx = Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase(), i]));
  return rows.map((r) => (name) => r[idx[name.toLowerCase()]] ?? '');
};

const answers = table(answersPath);
const run = table(runPath);
let exact = 0;
let wrongVersion = 0;
const misses = [];

answers.forEach((a, i) => {
  const r = run[i];
  const want = `${a('expected_source')}:${a('expected_source_id')}`;
  const got = r ? `${r('Source')}:${r('Source ID')}` : '(missing)';
  if (got === want && r('Version Key') === a('expected_version')) exact++;
  else if (got === want) { wrongVersion++; misses.push([a('#'), a('category'), 'wrong version', a('expected_version'), r('Version Key')]); }
  else misses.push([a('#'), a('category'), 'wrong card', want, got]);
});

const n = answers.length;
const pct = (x) => `${((x / n) * 100).toFixed(1)}%`;
console.log(`Cards:                     ${n}`);
console.log(`Exact-version accuracy:    ${exact} (${pct(exact)})`);
console.log(`Right card, wrong version: ${wrongVersion} (${pct(wrongVersion)})`);
console.log(`Wrong card or missing:     ${n - exact - wrongVersion} (${pct(n - exact - wrongVersion)})`);
if (misses.length) {
  console.log('\nMisses:');
  for (const m of misses) console.log(`  #${m[0]} [${m[1]}] ${m[2]}: expected ${m[3]}, got ${m[4]}`);
}
