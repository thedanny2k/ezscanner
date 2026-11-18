import { describe, expect, it } from 'vitest';
import { accuracyByModel } from '../src/stats.js';

describe('accuracyByModel', () => {
  it('counts a scan as correct unless someone corrected it or it failed', () => {
    const items = [
      { model: 'claude-sonnet-5-5', status: 'done' },
      { model: 'claude-sonnet-5-5', status: 'done' },
      { model: 'claude-sonnet-5-5', status: 'done', corrected: true },
      { model: 'claude-sonnet-5-5', status: 'failed' },
      { model: 'claude-haiku-5-5', status: 'done' },
      { status: 'done' }, // added by search: not a scan
      { model: 'claude-haiku-5-5', status: 'reading' }, // still in progress
      { model: 'claude-sonnet-5-5', status: 'review' }, // nobody has judged it yet
    ];
    expect(accuracyByModel(items)).toEqual([
      { model: 'claude-sonnet-5-5', scans: 4, corrected: 1, failed: 1, accuracy: 50 },
      { model: 'claude-haiku-5-5', scans: 1, corrected: 0, failed: 0, accuracy: 100 },
    ]);
  });
});
