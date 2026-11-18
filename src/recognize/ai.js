// recognize/ai.js — reading a card photo with Claude.
//
// Two transports send the same task object ({task:'identify'|'verify', model, image, ...}):
//   edgeTransport   -> Supabase Edge Function `identify`, which holds the Claude key (the target design).
//   directTransport -> straight from this phone with a key typed into Settings. Interim only, until
//                      team sign-in ships (docs/decisions/0006-interim-on-device-key.md).

import { buildContent, parseAiJson } from './prompts.js';
import { fmtNum } from '../cards.js';

export const MODELS = {
  'claude-sonnet-5-5': 'Most accurate: Claude Sonnet 5.5',
  'claude-haiku-5-5': 'Fast and cheapest: Claude Haiku 5.5',
};
export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const modelShortName = (m) => (m === 'text-reader' ? 'Text reader' : m.includes('haiku') ? 'Haiku 5.5' : m.includes('sonnet') ? 'Sonnet 5.5' : m);

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Calls the Claude API from the browser with a key stored on this phone. */
export function directTransport(getKey) {
  return async function send(task) {
    const body = {
      model: task.model,
      max_tokens: task.task === 'verify' ? 150 : 400,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: task.content || buildContent(task) }],
    };
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(CLAUDE_API, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': getKey(),
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        if (attempt < 2) { await sleep(1200 * (attempt + 1)); continue; }
        throw new Error("Couldn't reach the AI. Check your connection.");
      }
      if (res.status === 401 || res.status === 403) throw new Error('AI key was rejected. Check it in Settings.');
      const busy = res.status === 429 || res.status === 529 || res.status >= 500;
      if (busy && attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
      if (busy) throw new Error('The AI is busy right now. Tap to retry or search.');
      if (!res.ok) {
        let msg = '';
        try { msg = ((await res.json()).error || {}).message || ''; } catch (e) { /* no body */ }
        throw new Error('AI error: ' + (msg || res.status));
      }
      const j = await res.json();
      const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      return task.raw ? text : parseAiJson(text);
    }
  };
}

/** Calls the `identify` Edge Function as the signed-in user. Used once team sign-in ships. */
export function edgeTransport(client) {
  return async function send(task) {
    const { data, error } = await client.functions.invoke('identify', { body: task });
    if (error) throw new Error(error.message || 'The identify service failed.');
    return data;
  };
}

/** Card crop -> base64 JPEG with the long side capped (keeps image tokens, and cost, in check). */
export function canvasToJpegB64(canvas, maxSide) {
  const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  let c = canvas;
  if (s < 1) {
    c = document.createElement('canvas');
    c.width = Math.round(canvas.width * s);
    c.height = Math.round(canvas.height * s);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
  }
  return c.toDataURL('image/jpeg', 0.88).split(',')[1];
}

/**
 * @param {(task:object) => Promise<object>} send a transport
 * @param {(canvas:any, maxSide:number) => string} [encode] swapped out in tests
 */
export function createAi(send, encode = canvasToJpegB64) {
  return {
    /** Reads name, number, set and finish off the card. */
    identify(canvas, model) {
      return send({ task: 'identify', model, image: encode(canvas, 1600) });
    },

    /**
     * The visual double-check: which of these candidate cards is in the photo?
     * @returns {Promise<{card:object|null, finish:string, sure:boolean} | null>} null when nothing could be compared
     */
    async verify(canvas, cards, model) {
      const usable = cards.filter((c) => c.imgLarge || c.img).slice(0, 3);
      if (!usable.length) return null;
      const r = await send({
        task: 'verify',
        model,
        image: encode(canvas, 1000),
        candidates: usable.map((c) => ({ label: `${c.name} · ${c.setName} · ${fmtNum(c)}`, url: c.imgLarge || c.img })),
      });
      const i = Number.isInteger(r.match) ? r.match - 1 : -1;
      return { card: usable[i] || null, finish: r.finish || 'unknown', sure: r.sure !== false };
    },

    /** Settings -> "Test AI key". */
    async ping(model) {
      await send({ task: 'ping', model, raw: true, content: [{ type: 'text', text: 'Reply with OK.' }] });
      return true;
    },
  };
}
