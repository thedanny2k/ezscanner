// scan.js — the scan pipeline: photo -> read -> database match -> visual double-check -> status.
// No DOM and no network of its own: everything it needs is passed in, so it is unit-tested
// with fakes (tests/scan.test.js).

import { REVIEW_THRESHOLD, confidence, numFromAi, scoreCards } from './match.js';
import { printingFromFinish } from './cards.js';
import { applyVerdict } from './recognize/verify.js';

const AI_CONCURRENCY = 3;
const KEEP_IMAGES = 60;

/**
 * @param {object} deps
 * @param {() => object|null} deps.getAi         createAi(...) or null when no AI is set up
 * @param {(canvas:any) => Promise<{num:object|null, name:string, text:string}>} deps.ocr  free text reader
 * @param {() => object} deps.getProvider        active price provider
 * @param {() => {model:string, verify:'always'|'unsure'|'off', tcgKey?:string}} deps.getSettings
 * @param {(item:object, finished:boolean) => void} deps.onChange  called whenever an item changes
 */
export function createScanner({ getAi, ocr, getProvider, getSettings, onChange }) {
  const queue = [];
  const images = new Map(); // item id -> canvas, kept in memory so a scan can be retried
  const items = new Map();
  let running = 0;

  function trim() {
    for (const id of images.keys()) {
      if (images.size <= KEEP_IMAGES) break;
      const it = items.get(id);
      if (!it || (it.status !== 'reading' && it.status !== 'lookup')) { images.delete(id); items.delete(id); }
    }
  }

  async function read(item, canvas, ai, settings) {
    if (!ai) {
      const r = await ocr(canvas);
      item.model = 'text-reader';
      item.read = [r.name, r.num && r.num.label].filter(Boolean).join(' · ');
      if (!r.num && !r.name) throw new Error("Couldn't read the card. Tap to search for it.");
      return { hint: { text: r.text, name: r.name, num: r.num }, readable: null };
    }
    const r = await ai.identify(canvas, settings.model);
    item.model = settings.model;
    if (!r || r.found === false || !r.name) throw new Error('No card found in the photo. Tap to search.');
    const num = numFromAi(r.number, r.total);
    item.read = [r.name, num && num.label].filter(Boolean).join(' · ');
    item.finish = r.finish || 'unknown';
    item.first = !!r.first_edition;
    return {
      hint: { text: `${r.name} ${r.set_code || ''}`, name: r.name, setCode: r.set_code, setName: r.set_name, num },
      readable: r.readable,
    };
  }

  async function process(item) {
    const canvas = images.get(item.id);
    const settings = getSettings();
    const ai = getAi();
    Object.assign(item, { status: 'reading', error: '', verified: false, checkSkipped: false });
    onChange(item, false);
    try {
      if (!canvas) throw new Error('Photo no longer available. Tap to search.');
      const { hint, readable } = await read(item, canvas, ai, settings);

      item.status = 'lookup';
      onChange(item, false);
      const cards = await getProvider().findCards({ num: hint.num, name: hint.name }, { key: settings.tcgKey });
      if (!cards.length) throw new Error(`No match for “${item.read}”. Tap to search.`);

      const scored = scoreCards(cards, hint);
      let conf = confidence(scored, readable);
      let card = scored[0].c;
      let finish = item.finish;

      const close = scored.length > 1 && scored[0].s - scored[1].s < 3;
      const wantCheck = settings.verify === 'always' || (settings.verify === 'unsure' && (conf < REVIEW_THRESHOLD || close));
      if (ai && wantCheck) {
        let verdict = null;
        try {
          verdict = await ai.verify(canvas, scored.map((x) => x.c), settings.model);
        } catch (e) {
          // If the AI can't load the price source's card images the check can't run for any scan,
          // so keep the text-match confidence (like double-check off) and tell the person once.
          if (e.imagesUnavailable) item.checkSkipped = true;
          else conf = Math.min(conf, 80); // couldn't double-check: let a person look
        }
        if (verdict) {
          const v = applyVerdict(scored, conf, verdict);
          card = v.card;
          conf = v.confidence;
          item.verified = v.verified;
          if (v.finish && v.finish !== 'unknown') finish = v.finish;
        }
      }

      Object.assign(item, {
        card,
        finish,
        printing: printingFromFinish(card, finish, item.first),
        confidence: conf,
        confirmed: false,
        corrected: false,
        cands: scored.slice(0, 12).map((x) => x.c),
        status: conf >= REVIEW_THRESHOLD ? 'done' : 'review',
      });
    } catch (e) {
      item.status = 'failed';
      item.error = e.message || 'Something went wrong.';
    }
    onChange(item, true);
  }

  function pump() {
    const limit = getAi() ? AI_CONCURRENCY : 1;
    while (running < limit && queue.length) {
      const item = queue.shift();
      running++;
      process(item).finally(() => { running--; pump(); });
    }
  }

  return {
    /** Start identifying a freshly captured card. */
    enqueue(item, canvas) {
      images.set(item.id, canvas);
      items.set(item.id, item);
      trim();
      queue.push(item);
      pump();
    },
    /** Scan the same photo again (after changing model or settings, or after a network error). */
    retry(item) {
      if (!images.has(item.id)) return false;
      items.set(item.id, item);
      item.status = 'reading';
      queue.push(item);
      pump();
      return true;
    },
    hasImage: (id) => images.has(id),
    forget(id) { images.delete(id); items.delete(id); },
    get busy() { return running + queue.length; },
  };
}
