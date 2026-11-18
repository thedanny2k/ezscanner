// stats.js — accuracy from real use. A scan counts as correct when nobody had to change
// the card or version afterwards. This is the number that goes on the resume.

/**
 * @param {{model?:string, status:string, corrected?:boolean}[]} items
 * @returns {{model:string, scans:number, corrected:number, failed:number, accuracy:number}[]}
 */
export function accuracyByModel(items) {
  const by = new Map();
  for (const it of items) {
    if (!it.model) continue; // added by search, not scanned
    if (it.status !== 'done' && it.status !== 'failed') continue; // in progress or not judged yet
    const row = by.get(it.model) || { model: it.model, scans: 0, corrected: 0, failed: 0 };
    row.scans++;
    if (it.status === 'failed') row.failed++;
    else if (it.corrected) row.corrected++;
    by.set(it.model, row);
  }
  return [...by.values()]
    .map((r) => ({ ...r, accuracy: r.scans ? Math.round(((r.scans - r.corrected - r.failed) / r.scans) * 1000) / 10 : 0 }))
    .sort((a, b) => b.scans - a.scans);
}
