import { describe, expect, it } from 'vitest';
import { THEMES, resolveTheme } from '../src/theme.js';
import { DEFAULTS } from '../src/settings.js';

describe('light and dark mode', () => {
  it('uses the choice, or follows the phone for "Match phone"', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
  it('keeps today\'s dark look unless someone changes it', () => {
    expect(DEFAULTS.theme).toBe('dark');
    expect(Object.keys(THEMES)).toEqual(['dark', 'light', 'system']);
  });
});
