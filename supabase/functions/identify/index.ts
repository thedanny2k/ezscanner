// supabase/functions/identify — reads card photos with Claude for signed-in team members.
// Two tasks, the same ones src/recognize/ai.js sends:
//   {task: "identify", model, image}              -> what is printed on the card
//   {task: "verify", model, image, candidates[]}  -> which official image matches the photo
// The Claude key lives only here, in Supabase secrets — never on phones or in the repo.
// The prompts are a copy of src/recognize/prompts.js; keep the two in sync.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy identify
//
// STATUS: written, not deployed or tested yet (ROADMAP v0.3).

import { createClient } from 'npm:@supabase/supabase-js@2';

const MODELS = new Set(['claude-sonnet-5-5', 'claude-haiku-5-5']);
// Lowest thinking setting per model (same as THINKING_OFF in src/recognize/ai.js).
// Sonnet 5.5 rejects {type: 'disabled'}; Haiku 5.5 rejects 'between_tools'.
const THINKING_OFF: Record<string, { type: string }> = {
  'claude-sonnet-5-5': { type: 'between_tools' },
  'claude-haiku-5-5': { type: 'disabled' },
};
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const MAX_IMAGE_B64 = 8_000_000; // ~6 MB image; the app sends well under 300 KB
const ALLOWED_IMAGE_HOSTS = new Set(['tcgplayer-cdn.tcgplayer.com', 'images.pokemontcg.io', 'assets.tcgdex.net', 'images.scrydex.com']);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const IDENTIFY_PROMPT = `This photo shows one English-language Pokémon TCG card. It may be in a sleeve or toploader, tilted, or have glare. Identify the exact printing.

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

const verifyPrompt = (n) => `The first image is a phone photo of one Pokémon card (the scan). The next ${n} image${n > 1 ? 's are' : ' is'} official card image${n > 1 ? 's' : ''}, labelled Candidate 1${n > 1 ? ` to Candidate ${n}` : ''}.

Decide which candidate is the same printing as the scan. Compare the artwork, name, set symbol, collector number and layout. Different sets often reuse a name or number, so do not go by the name alone. Then judge the scan's finish from the photo: a reverse holo has a shiny pattern on the card body outside the art box; a holo has a shiny art box.

Reply with only a JSON object and nothing else:
{"match": 1, "finish": "holo | reverse_holo | non_holo | unknown", "sure": true}

Use "match": null if none of the candidates is the scanned card. Use "sure": false if glare, blur or a sleeve keeps you from being certain.`;

type Candidate = { label: string; url: string };
type Task = { task?: string; model?: string; image?: string; candidates?: Candidate[] };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function buildContent(t: Task, candidates: Candidate[]) {
  const scan = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: t.image } };
  if (t.task !== 'verify') return [scan, { type: 'text', text: IDENTIFY_PROMPT }];
  const content: unknown[] = [{ type: 'text', text: 'Scan:' }, scan];
  candidates.forEach((c, i) => {
    content.push({ type: 'text', text: `Candidate ${i + 1}: ${String(c.label).slice(0, 120)}` });
    content.push({ type: 'image', source: { type: 'url', url: c.url } });
  });
  content.push({ type: 'text', text: verifyPrompt(candidates.length) });
  return content;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);

  // Only signed-in members of a team may spend Claude credits.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Sign in first.' }, 401);
  const { count } = await supabase
    .from('team_members')
    .select('team_id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if (!count) return json({ error: 'You are not on a team yet. Ask the owner to add you.' }, 403);

  let t: Task;
  try {
    t = await req.json();
  } catch {
    return json({ error: 'Bad request.' }, 400);
  }
  if (!t.image || t.image.length > MAX_IMAGE_B64) return json({ error: 'Missing or oversized image.' }, 400);
  const model = t.model && MODELS.has(t.model) ? t.model : DEFAULT_MODEL;

  // Candidate images may only come from the card-image hosts the app uses.
  const candidates = (t.candidates ?? []).slice(0, 3).filter((c) => {
    try {
      const u = new URL(c.url);
      return u.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.has(u.hostname);
    } catch {
      return false;
    }
  });
  if (t.task === 'verify' && !candidates.length) return json({ error: 'No usable candidate images.' }, 400);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: t.task === 'verify' ? 150 : 400,
      thinking: THINKING_OFF[model],
      messages: [{ role: 'user', content: buildContent(t, candidates) }],
    }),
  });
  if (res.status === 429 || res.status === 529) return json({ error: 'The AI is busy. Try again in a moment.' }, 503);
  if (!res.ok) return json({ error: `Claude API error (${res.status}).` }, 502);

  const out = await res.json();
  const text = (out.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');
  try {
    return json(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
  } catch {
    return json({ error: "The AI's answer couldn't be read." }, 502);
  }
});
