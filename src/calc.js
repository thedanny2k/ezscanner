// calc.js — the everyday calculator (not the offer calculator). Pure functions, unit-tested.
//
// Works like a phone calculator: × and ÷ before + and −, and % the way people expect when pricing:
//   200 + 10%  -> 220   (10% of what's on the left)
//   200 × 15%  -> 30    (15% of 200)
//   50%        -> 0.5
// No eval(): the expression is a list of tokens and is worked out by hand.

export const OPS = { '+': '+', '-': '−', '*': '×', '/': '÷' };

/** Fresh calculator. `tokens` alternate number strings and operators; a number may end in "%". */
export const initialCalc = () => ({ tokens: [], done: false, last: '' });

const isOp = (t) => t in OPS;
const isNum = (t) => t != null && !isOp(t);
const lastOf = (s) => s.tokens[s.tokens.length - 1];
const withLast = (s, t) => [...s.tokens.slice(0, -1), t];
const MAX_DIGITS = 15;

/** Plain-number form used inside the calculator ("1234.5", "-0.25"). */
export function toRaw(n) {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 1e10) / 1e10;
  return String(Object.is(r, -0) ? 0 : r);
}

/**
 * The value of an expression, or {error} when it can't be worked out.
 * A trailing operator is ignored, so the live result shows while you type "12 +".
 */
export function evaluate(tokens) {
  const t = [...tokens];
  while (t.length && isOp(t[t.length - 1])) t.pop();
  if (!t.length) return { value: 0 };
  let sum = 0; // everything before the current + / − term
  let sign = 1;
  let term = null; // the current × / ÷ chain
  let pending = null; // '*' or '/' waiting for its right side
  for (let i = 0; i < t.length; i++) {
    const tok = t[i];
    if (tok === '+' || tok === '-') {
      sum += sign * (term ?? 0);
      sign = tok === '+' ? 1 : -1;
      term = null;
      continue;
    }
    if (tok === '*' || tok === '/') {
      pending = tok;
      continue;
    }
    const pct = tok.endsWith('%');
    const n = parseFloat(pct ? tok.slice(0, -1) : tok);
    if (!Number.isFinite(n)) return { error: 'Error' };
    // "200 + 10%" is 10% of 200; anywhere else "15%" is 0.15.
    const v = pct ? (term === null && i > 0 ? (sum * n) / 100 : n / 100) : n;
    if (term === null) term = v;
    else if (pending === '*') term *= v;
    else if (pending === '/') {
      if (v === 0) return { error: "Can't divide by 0" };
      term /= v;
    }
    pending = null;
  }
  const value = sum + sign * (term ?? 0);
  return Number.isFinite(value) ? { value: Math.round(value * 1e10) / 1e10 } : { error: 'Too big' };
}

/** Applies one key: '0'-'9', '.', '+', '-', '*', '/', '%', 'neg', 'back', 'clear', '='. */
export function press(s, key) {
  const last = lastOf(s);
  if (key === 'clear') return initialCalc();

  if (/^[0-9]$/.test(key) || key === '.') {
    if (s.done || !s.tokens.length || isOp(last)) {
      const start = key === '.' ? '0.' : key;
      return { tokens: s.done ? [start] : [...s.tokens, start], done: false, last: s.done ? '' : s.last };
    }
    if (last.endsWith('%')) return s;
    if (key === '.' && last.includes('.')) return s;
    if (last.replace(/[-.]/g, '').length >= MAX_DIGITS) return s;
    const next = last === '0' && key !== '.' ? key : last === '-0' && key !== '.' ? `-${key}` : last + key;
    return { ...s, tokens: withLast(s, next) };
  }

  if (isOp(key)) {
    if (s.done) return { tokens: [lastOf(s) || '0', key], done: false, last: '' };
    if (!s.tokens.length) return { ...s, tokens: ['0', key] };
    if (isOp(last)) return { ...s, tokens: withLast(s, key) };
    if (last.endsWith('.')) return { ...s, tokens: [...withLast(s, last.slice(0, -1)), key] };
    return { ...s, tokens: [...s.tokens, key] };
  }

  if (key === '%') {
    if (!isNum(last) || last.endsWith('%')) return s;
    return { ...s, done: false, tokens: withLast(s, `${last.replace(/\.$/, '')}%`) };
  }

  if (key === 'neg') {
    if (!isNum(last)) return s.tokens.length ? { ...s, tokens: [...s.tokens, '-0'] } : { ...s, tokens: ['-0'] };
    const flipped = last.startsWith('-') ? last.slice(1) : `-${last}`;
    return { ...s, done: false, tokens: withLast(s, flipped) };
  }

  if (key === 'back') {
    if (s.done) return { ...s, done: false, last: '' };
    if (!s.tokens.length) return s;
    if (isOp(last) || last.length <= 1 || last === '-0' || /^-\d$/.test(last)) return { ...s, tokens: s.tokens.slice(0, -1) };
    return { ...s, tokens: withLast(s, last.slice(0, -1)) };
  }

  if (key === '=') {
    if (!s.tokens.length) return s;
    const r = evaluate(s.tokens);
    if (r.error) return s;
    return { tokens: [toRaw(r.value)], done: true, last: expressionText(s.tokens) };
  }
  return s;
}

/** Puts a number in (e.g. the bucket's market value): replaces the number being typed, or starts a new one. */
export function insert(s, n) {
  const raw = toRaw(n);
  const last = lastOf(s);
  if (s.done || !s.tokens.length) return { tokens: [raw], done: false, last: '' };
  if (isOp(last)) return { ...s, tokens: [...s.tokens, raw] };
  return { ...s, tokens: withLast(s, raw) };
}

/** 1234567.891 -> "1,234,567.891" (at most 8 decimals; scientific beyond 1e15). */
export function formatNumber(n) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e15) return n.toExponential(6);
  return n.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

/** A number token as typed: commas in the whole part, the decimal part left alone ("1,234.50", "0."). */
function formatTyped(tok) {
  const pct = tok.endsWith('%') ? '%' : '';
  const body = pct ? tok.slice(0, -1) : tok;
  const neg = body.startsWith('-') ? '−' : '';
  const [whole, frac] = body.replace('-', '').split('.');
  const w = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg}${w}${frac !== undefined ? '.' + frac : ''}${pct}`;
}

export const expressionText = (tokens) => tokens.map((t) => (isOp(t) ? OPS[t] : formatTyped(t))).join(' ');

/**
 * What the screen shows: the expression (or the finished one above the answer) and the answer.
 * @returns {{expr:string, result:string, error:string}}
 */
export function display(s) {
  if (s.done) return { expr: `${s.last} =`, result: formatNumber(parseFloat(lastOf(s))), error: '' };
  if (!s.tokens.length) return { expr: '', result: '0', error: '' };
  const r = evaluate(s.tokens);
  return { expr: expressionText(s.tokens), result: r.error ? '' : formatNumber(r.value), error: r.error || '' };
}
