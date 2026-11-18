// recognize/prompts.js — what we ask Claude, and how a task becomes a Messages API request.
// supabase/functions/identify/index.ts carries a copy of this file's logic; keep them in sync.

export const IDENTIFY_PROMPT = `This photo shows one English-language Pokémon TCG card. It may be in a sleeve or toploader, tilted, or have glare. Identify the exact printing.

Reply with only a JSON object and nothing else:
{"found": true,
 "name": "card name exactly as printed, including suffixes like ex, EX, GX, V, VMAX, VSTAR, BREAK, or owners like Team Rocket's / Misty's",
 "number": "collector number as printed before the slash, e.g. 025, 4, TG05, GG12, SV49; or the promo code if there is no slash, e.g. SWSH050",
 "total": "number printed after the slash, e.g. 198 or TG30, or null",
 "set_code": "small set code printed near the number, e.g. SVI, PAL, OBF, or null",
 "set_name": "your best guess of the expansion name",
 "finish": "holo | reverse_holo | non_holo | unknown",
 "first_edition": false,
 "readable": "high | medium | low (how clearly you could read the collector number)"}

If no Pokémon card is visible, reply {"found": false}.`;

export const verifyPrompt = (n) => `The first image is a phone photo of one Pokémon card (the scan). The next ${n} image${n > 1 ? 's are' : ' is'} official card image${n > 1 ? 's' : ''}, labelled Candidate 1${n > 1 ? ` to Candidate ${n}` : ''}.

Decide which candidate is the same printing as the scan. Compare the artwork, name, set symbol, collector number and layout. Different sets often reuse a name or number, so do not go by the name alone. Then judge the scan's finish from the photo: a reverse holo has a shiny pattern on the card body outside the art box; a holo has a shiny art box.

Reply with only a JSON object and nothing else:
{"match": 1, "finish": "holo | reverse_holo | non_holo | unknown", "sure": true}

Use "match": null if none of the candidates is the scanned card. Use "sure": false if glare, blur or a sleeve keeps you from being certain.`;

/**
 * A task -> Messages API `content`.
 * @param {{task:'identify', image:string} | {task:'verify', image:string, candidates:{label:string, url:string}[]}} t
 */
export function buildContent(t) {
  const scan = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: t.image } };
  if (t.task === 'verify') {
    const content = [{ type: 'text', text: 'Scan:' }, scan];
    t.candidates.forEach((c, i) => {
      content.push({ type: 'text', text: `Candidate ${i + 1}: ${c.label}` });
      content.push({ type: 'image', source: { type: 'url', url: c.url } });
    });
    content.push({ type: 'text', text: verifyPrompt(t.candidates.length) });
    return content;
  }
  return [scan, { type: 'text', text: IDENTIFY_PROMPT }];
}

/** Pulls the JSON object out of the model's reply. */
export function parseAiJson(text) {
  const a = String(text || '').indexOf('{');
  const b = String(text || '').lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error("The AI's answer couldn't be read. Tap to search.");
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch (e) {
    throw new Error("The AI's answer couldn't be read. Tap to search.");
  }
}
