// recognize/ocr.js — the free text reader (Tesseract.js), ported from the prototype.
// Used when no AI is available (demo mode, offline). Reads the collector number from the
// card's bottom strip and the name from its top strip.

import { parseNumber, guessName } from '../match.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
let workerPromise = null;
let chain = Promise.resolve();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Couldn't load the text reader. Check your connection."));
    document.head.appendChild(s);
  });
}

export function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      if (!window.Tesseract) await loadScript(TESSERACT_URL);
      const w = await window.Tesseract.createWorker('eng', 1);
      await w.setParameters({ tessedit_pageseg_mode: '11' }); // sparse text
      return w;
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

/** One page at a time through the single worker. */
function ocr(canvas) {
  const run = chain.then(async () => (await (await getWorker()).recognize(canvas)).data.text || '');
  chain = run.catch(() => {});
  return run;
}

/** Crop, upscale small text, grey + contrast stretch. */
export function prep(src, x, y, w, h, targetWidth) {
  [x, y, w, h] = [x, y, w, h].map(Math.round);
  const scale = targetWidth ? Math.max(1, targetWidth / w) : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const p = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < p.length; i += 4) {
    const g = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0;
    p[i] = g;
    hist[g]++;
  }
  const n = c.width * c.height;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.02) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < p.length; i += 4) {
    const g = Math.max(0, Math.min(255, ((p[i] - lo) * 255) / range));
    p[i] = p[i + 1] = p[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** @returns {Promise<{num:object|null, name:string, text:string}>} */
export async function readCard(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const bottom = await ocr(prep(canvas, 0, H * 0.7, W, H * 0.3, 2400));
  let num = parseNumber(bottom);
  const top = await ocr(prep(canvas, 0, 0, W, H * 0.25, 2000));
  let text = `${bottom}\n${top}`;
  if (!num) {
    const whole = await ocr(prep(canvas, 0, 0, W, H, Math.min(1800, W * 2)));
    text += `\n${whole}`;
    num = parseNumber(whole);
  }
  return { num, name: guessName(top) || guessName(text), text };
}
