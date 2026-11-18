import { describe, expect, it, vi } from 'vitest';
import { createScanner } from '../src/scan.js';
import { createAi } from '../src/recognize/ai.js';
import { applyVerdict } from '../src/recognize/verify.js';
import { buildContent, parseAiJson } from '../src/recognize/prompts.js';

const card = (over) => ({ id: 'p:sv1-25', source: 'p', sourceId: 'sv1-25', name: 'Pikachu', number: '25', printedTotal: 198,
  setName: 'Scarlet & Violet', setCode: 'SVI', releaseDate: '2023/03/31', imgLarge: 'https://img/pikachu.png',
  prices: { normal: { market: 0.18 }, reverseHolofoil: { market: 0.52 } }, ...over });
const pikachu = card();
const centiskorch = card({ id: 'p:swsh6-25', sourceId: 'swsh6-25', name: 'Centiskorch', setName: 'Chilling Reign', setCode: 'CRE',
  releaseDate: '2021/06/18', imgLarge: 'https://img/centiskorch.png', prices: { normal: { market: 0.08 } } });

const READ = { found: true, name: 'Pikachu', number: '025', total: '198', set_code: 'SVI', set_name: 'Scarlet & Violet', finish: 'non_holo', first_edition: false, readable: 'high' };

/** Runs one scan through the pipeline with fake AI answers and a fake price provider. */
async function scan({ read = READ, verdict = { match: 1, finish: 'non_holo', sure: true }, verify = 'always', cards = [centiskorch, pikachu], useAi = true } = {}) {
  const sent = [];
  const send = vi.fn(async (task) => {
    sent.push(task);
    if (task.task === 'identify') return read;
    if (verdict instanceof Error) throw verdict;
    return verdict;
  });
  const ai = createAi(send, () => 'BASE64');
  const item = { id: 'item-1', status: 'reading' };
  await new Promise((resolve) => {
    const scanner = createScanner({
      getAi: () => (useAi ? ai : null),
      ocr: async () => ({ num: null, name: 'Pikachu', text: 'Pikachu SVI' }),
      getProvider: () => ({ findCards: async () => cards }),
      getSettings: () => ({ model: 'claude-sonnet-5-5', verify }),
      onChange: (_, finished) => finished && resolve(),
    });
    scanner.enqueue(item, {});
  });
  return { item, sent };
}

describe('scan pipeline', () => {
  it('reads, matches, double-checks and files a confident scan as done', async () => {
    const { item, sent } = await scan();
    expect(item.status).toBe('done');
    expect(item.card.name).toBe('Pikachu');
    expect(item.printing).toBe('normal');
    expect(item.confidence).toBeGreaterThanOrEqual(95);
    expect(item.verified).toBe(true);
    expect(item.model).toBe('claude-sonnet-5-5');
    expect(sent.map((t) => t.task)).toEqual(['identify', 'verify']);
    expect(sent[1].candidates[0].url).toBe('https://img/pikachu.png');
  });

  it('takes the version from the double-check (reverse holo is where the money is)', async () => {
    const { item } = await scan({ verdict: { match: 1, finish: 'reverse_holo', sure: true } });
    expect(item.printing).toBe('reverseHolofoil');
  });

  it('lets the pictures overrule the text match', async () => {
    const { item } = await scan({ verdict: { match: 2, finish: 'non_holo', sure: true } });
    expect(item.card.name).toBe('Centiskorch');
    expect(item.status).toBe('done');
    expect(item.confidence).toBe(86);
  });

  it('sends the card to review when the double-check is not sure', async () => {
    const { item } = await scan({ verdict: { match: 1, finish: 'unknown', sure: false } });
    expect(item.status).toBe('review');
    expect(item.confidence).toBeLessThan(85);
  });

  it('sends the card to review when no candidate matches the photo', async () => {
    const { item } = await scan({ verdict: { match: null, finish: 'unknown', sure: true } });
    expect(item.status).toBe('review');
    expect(item.confidence).toBeLessThanOrEqual(50);
  });

  it('sends the card to review when the double-check could not run', async () => {
    const { item } = await scan({ verdict: new Error('network') });
    expect(item.status).toBe('review');
    expect(item.card.name).toBe('Pikachu');
  });

  it('skips the double-check when it is off or the match is already clear', async () => {
    expect((await scan({ verify: 'off' })).sent).toHaveLength(1);
    expect((await scan({ verify: 'unsure' })).sent).toHaveLength(1);
  });

  it('double-checks in "unsure" mode when the number was hard to read', async () => {
    const { sent } = await scan({ verify: 'unsure', read: { ...READ, readable: 'low' } });
    expect(sent).toHaveLength(2);
  });

  it('fails clearly when there is no card or no database match', async () => {
    expect((await scan({ read: { found: false } })).item).toMatchObject({ status: 'failed', error: expect.stringMatching(/No card found/) });
    expect((await scan({ cards: [] })).item).toMatchObject({ status: 'failed', error: expect.stringMatching(/No match/) });
  });

  it('falls back to the free text reader when no AI is set up', async () => {
    const { item, sent } = await scan({ useAi: false });
    expect(sent).toHaveLength(0);
    expect(item.model).toBe('text-reader');
    expect(item.card.name).toBe('Pikachu');
  });
});

describe('applyVerdict', () => {
  const scored = [{ c: pikachu, s: 11 }, { c: centiskorch, s: 4.5 }];
  it('leaves the match alone when there was no double-check', () => {
    expect(applyVerdict(scored, 70, null)).toEqual({ card: pikachu, confidence: 70, verified: false });
  });
  it('raises confidence when the pictures agree', () => {
    expect(applyVerdict(scored, 55, { card: pikachu, finish: 'holo', sure: true })).toMatchObject({ confidence: 95, verified: true, finish: 'holo' });
  });
});

describe('prompts', () => {
  it('builds a verify request: scan first, then each labelled candidate by URL', () => {
    const content = buildContent({ task: 'verify', image: 'B64', candidates: [{ label: 'Pikachu', url: 'https://img/a.png' }, { label: 'Centiskorch', url: 'https://img/b.png' }] });
    const images = content.filter((b) => b.type === 'image');
    expect(images[0].source).toMatchObject({ type: 'base64', data: 'B64' });
    expect(images.slice(1).map((b) => b.source.url)).toEqual(['https://img/a.png', 'https://img/b.png']);
    expect(content.at(-1).text).toMatch(/Candidate 1 to Candidate 2/);
  });
  it('reads JSON even with extra words around it', () => {
    expect(parseAiJson('Sure! {"found": true, "name": "Pikachu"} Hope that helps')).toEqual({ found: true, name: 'Pikachu' });
    expect(() => parseAiJson('no idea')).toThrow(/couldn't be read/);
  });
});
