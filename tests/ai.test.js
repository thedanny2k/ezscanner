import { afterEach, describe, expect, it, vi } from 'vitest';
import { THINKING_OFF, directTransport, requestBody } from '../src/recognize/ai.js';

const task = (model) => ({ task: 'identify', model, image: 'B64' });
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });
const ANSWER = { content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: '{"found": true, "name": "Pikachu"}' }] };

afterEach(() => vi.unstubAllGlobals());

describe('requestBody: the thinking setting each model accepts', () => {
  it('Sonnet 5.5 gets between_tools (it rejects "disabled")', () => {
    expect(requestBody(task('claude-sonnet-5-5')).thinking).toEqual({ type: 'between_tools' });
  });
  it('Haiku 5.5 gets disabled (it rejects "between_tools")', () => {
    expect(requestBody(task('claude-haiku-5-5')).thinking).toEqual({ type: 'disabled' });
  });
  it('the fallback leaves thinking at the model default with room to think', () => {
    const body = requestBody(task('claude-sonnet-5-5'), true);
    expect(body.thinking).toBeUndefined();
    expect(body.max_tokens).toBeGreaterThanOrEqual(4000);
  });
  it('covers every model offered in Settings', () => {
    expect(Object.keys(THINKING_OFF).sort()).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5']);
  });
});

describe('directTransport', () => {
  it('retries once without a thinking setting when the API rejects it', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply(400, { error: { message: 'To turn thinking off on this model, send "thinking": {"type": "between_tools"}' } }))
      .mockResolvedValueOnce(reply(200, ANSWER));
    vi.stubGlobal('fetch', fetch);
    const out = await directTransport(() => 'sk-test')(task('claude-sonnet-5-5'));
    expect(out).toEqual({ found: true, name: 'Pikachu' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[0][1].body).thinking).toEqual({ type: 'between_tools' });
    expect(JSON.parse(fetch.mock.calls[1][1].body).thinking).toBeUndefined();
  });

  it('does not loop on other 400 errors', async () => {
    const fetch = vi.fn().mockResolvedValue(reply(400, { error: { message: 'image too large' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(directTransport(() => 'sk-test')(task('claude-sonnet-5-5'))).rejects.toThrow(/image too large/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('says plainly when the key is wrong', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401, {})));
    await expect(directTransport(() => 'bad')(task('claude-haiku-5-5'))).rejects.toThrow(/key was rejected/);
  });
});
