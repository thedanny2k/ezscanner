// match.js — turning what was read off a card into a ranked list of database matches.
// Pure functions only (no DOM, no network), so everything here is unit-tested.

/** Letter prefixes that belong to subset numbering, e.g. TG05/TG30, GG12/GG70, SV49/SV94. */
export const SUBSET_PREFIXES = ['TG', 'GG', 'RC', 'SV', 'SH', 'SL', 'H'];

const DIGIT_LOOKALIKES = { O: '0', o: '0', I: '1', l: '1', S: '5', B: '8' };
const fixDigits = (s) => s.replace(/[OoIlSB]/g, (ch) => DIGIT_LOOKALIKES[ch]);

function splitPrefix(prefix, digits) {
  if (prefix && SUBSET_PREFIXES.includes(prefix.toUpperCase())) {
    return { prefix: prefix.toUpperCase(), digits: fixDigits(digits) };
  }
  // Letters right before the digits that look like digits (O, l, I...) are probably misread digits.
  let tail = '';
  for (let i = prefix.length - 1; i >= 0 && /[OoIlSB]/.test(prefix[i]) && tail.length + digits.length < 3; i--) {
    tail = prefix[i] + tail;
  }
  return { prefix: '', digits: fixDigits(tail + digits) };
}

/**
 * Finds a collector number like "025/198", "TG05/TG30" or "4/102" in free text (OCR output).
 * @returns {{prefix:string, digits:string, suffix:string, total:number, label:string} | null}
 */
export function parseNumber(text) {
  if (!text) return null;
  const re = /(^|[^A-Za-z0-9])([A-Za-z]{0,4})([0-9OoIlSB]{1,3})([a-z]?)\s{0,2}[\/\\|]\s{0,2}([A-Za-z]{0,4})([0-9OoIlSB]{2,3})(?![0-9])/g;
  let m;
  while ((m = re.exec(text))) {
    const [, , pre, nRaw, suffix, tPre, tRaw] = m;
    if (!/\d/.test(nRaw) || !/\d/.test(tRaw)) continue;
    const n = splitPrefix(pre, nRaw);
    const t = splitPrefix(tPre, tRaw);
    if (!/^\d+$/.test(n.digits) || !/^\d+$/.test(t.digits)) continue;
    const num = parseInt(n.digits, 10);
    const total = parseInt(t.digits, 10);
    if (!num || total < 10 || total > 400 || num > total + 160) continue;
    return { prefix: n.prefix, digits: n.digits, suffix, total, label: `${n.prefix}${n.digits}${suffix}/${t.prefix}${t.digits}` };
  }
  return null;
}

/**
 * Collector number as the AI reported it, e.g. ("025", "198") or ("SWSH050", null).
 * @returns {{prefix:string, digits:string, suffix:string, total:number|null, label:string} | null}
 */
export function numFromAi(number, total) {
  const n = String(number || '').toUpperCase().replace(/\s+/g, '');
  const m = n.match(/^([A-Z]*)(\d+)([A-Z]?)$/);
  if (!m) return null;
  const t = (String(total || '').match(/\d+/) || [])[0];
  return {
    prefix: m[1],
    digits: m[2],
    suffix: m[3].toLowerCase(),
    total: t ? parseInt(t, 10) : null,
    label: n + (total ? '/' + String(total).toUpperCase().replace(/\s+/g, '') : ''),
  };
}

/** "025" -> "25", "TG05" -> "tg5": a number in a form two sources can compare. */
export const normNumStr = (s) => String(s || '').replace(/^([A-Za-z]*)0*(\d)/, '$1$2').toLowerCase();
export const normNum = (num) => normNumStr(num.prefix + num.digits + num.suffix);

/** Every spelling of a collector number a database might use: 25, 025, 25 padded to 2. */
export function numberVariants(num) {
  const stripped = num.digits.replace(/^0+(?=\d)/, '');
  const v = new Set([
    num.prefix + stripped + num.suffix,
    num.prefix + num.digits + num.suffix,
    num.prefix + stripped.padStart(2, '0') + num.suffix,
  ]);
  if (num.prefix && !SUBSET_PREFIXES.includes(num.prefix)) {
    v.add(stripped + num.suffix);
    v.add(num.digits + num.suffix);
  }
  return [...v];
}

const STOP = new Set(('basic stage evolves evolve from trainer item supporter stadium tool pokemon pokémon put this card onto when your ' +
  'opponent active bench damage attack ability weakness resistance retreat illus rule the and with energy tera mega').split(' '));

/** Best guess at a card name from OCR text of the card's top strip. */
export function guessName(text) {
  for (const line of (text || '').split('\n')) {
    const toks = (line.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.\-]{2,}/g) || [])
      .filter((w) => /^[A-ZÀ-Þ][a-zà-ÿ'’.\-]{2,}$/.test(w) && !STOP.has(w.toLowerCase()));
    if (toks.length) return toks[0].replace(/[.\-'’]+$/, '');
  }
  return '';
}

/** Splits typed search text into a collector number and a name: "charizard 4/102" -> {num, name:"charizard"}. */
export function splitQuery(text) {
  const t = String(text || '');
  const num = parseNumber(' ' + t);
  const name = t.replace(/[A-Za-z]{0,4}[0-9]{1,3}[a-z]?\s*\/\s*[A-Za-z]{0,4}[0-9]{1,3}/, ' ').replace(/#\s*\d+/, ' ').replace(/\s+/g, ' ').trim();
  return { num, name };
}

export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Scores candidate cards against what was read.
 * @param {import('./providers/provider.js').Card[]} cards
 * @param {{text?:string, name?:string, setCode?:string, setName?:string, num?:object}} hint
 */
export function scoreCards(cards, hint) {
  const text = hint.text || '';
  const upper = new Set(text.toUpperCase().match(/[A-Z]{2,5}/g) || []);
  if (hint.setCode) upper.add(String(hint.setCode).toUpperCase());
  const words = text.toLowerCase().match(/[a-zà-ÿ]{3,}/g) || [];
  const fullName = normName(hint.name);
  const setWords = new Set(normName(hint.setName).split(' ').filter((w) => w.length >= 3));
  const want = hint.num ? normNum(hint.num) : '';
  return cards
    .map((c) => {
      const code = (c.setCode || '').toUpperCase();
      const codeMatch = !!code && upper.has(code);
      const first = c.name.toLowerCase().split(/[\s-]/)[0].replace(/[^a-zà-ÿ]/g, '');
      const nameExact = !!fullName && normName(c.name) === fullName;
      const nameMatch = nameExact || (first.length >= 3 && words.some((w) => w === first || (first.length > 4 && lev(w, first) <= 2)));
      const numMatch = !!hint.num && normNumStr(c.number) === want &&
        (!hint.num.total || !c.printedTotal || Number(c.printedTotal) === hint.num.total);
      const sw = normName(c.setName).split(' ').filter((w) => w.length >= 3);
      const setMatch = setWords.size > 0 && sw.length > 0 && sw.filter((w) => setWords.has(w)).length / sw.length >= 0.5;
      const hasPrices = Object.keys(c.prices || {}).length > 0;
      const s = (numMatch ? 4 : 0) + (codeMatch ? 3 : 0) + (nameExact ? 3.5 : nameMatch ? 3 : 0) + (setMatch ? 1.5 : 0) + (hasPrices ? 0.5 : 0);
      return { c, s, numMatch, codeMatch, nameMatch, setMatch };
    })
    .sort((a, b) => b.s - a.s || String(b.c.releaseDate || '').localeCompare(String(a.c.releaseDate || '')));
}

/** 5–99: how sure we are that the top-scored card is right. Ties with the runner-up cap it at 55. */
export function confidence(scored, readable) {
  const [best, second] = scored;
  if (!best) return 0;
  let p = 15 + (best.numMatch ? 40 : 0) + (best.nameMatch ? 25 : 0) + ((best.codeMatch || best.setMatch) ? 20 : 0);
  if (second && Math.floor(second.s) === Math.floor(best.s)) p = Math.min(p, 55);
  if (readable === 'low') p = Math.min(p, 60);
  return Math.max(5, Math.min(99, p));
}

/** Scans under this go to "Needs review". */
export const REVIEW_THRESHOLD = 85;
