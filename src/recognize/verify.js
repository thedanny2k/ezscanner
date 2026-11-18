// recognize/verify.js — what the visual double-check does to a match.
//
// Why it exists: the AI can read the right name and number and still land on the wrong set,
// a reprint, an alt art or the wrong version. Those mistakes cost the most money. So after
// the database match, Claude compares the scan with the official images of the top candidates
// (createAi().verify in ai.js) and this file turns its verdict into a card and a confidence.

/**
 * @param {{c:object, s:number}[]} scored  candidates, best first (from match.js scoreCards)
 * @param {number} conf                    confidence before the double-check
 * @param {{card:object|null, finish:string, sure:boolean}|null} verdict
 * @returns {{card:object, confidence:number, verified:boolean, finish?:string}}
 */
export function applyVerdict(scored, conf, verdict) {
  const best = scored[0].c;
  if (!verdict) return { card: best, confidence: conf, verified: false };

  // "None of these is the scanned card": don't trust the match.
  if (!verdict.card) return { card: best, confidence: Math.min(conf, 50), verified: false, finish: verdict.finish };

  const agrees = verdict.card.id === best.id;
  let confidence;
  if (agrees) confidence = verdict.sure ? Math.max(conf, 95) : Math.min(conf, 80);
  else confidence = verdict.sure ? 86 : 60; // the pictures overruled the text match
  return { card: verdict.card, confidence, verified: verdict.sure, finish: verdict.finish };
}
