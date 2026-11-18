// settings.js — per-phone preferences (localStorage). Nothing here is shared with the team.

import { DEFAULT_MODEL } from './recognize/ai.js';
import { DEFAULT_PROVIDER } from './providers/index.js';

const KEY = 'ezscanner.settings';

export const DEFAULTS = {
  model: DEFAULT_MODEL,
  verify: 'always', // visual double-check: 'always' | 'unsure' | 'off'
  provider: DEFAULT_PROVIDER,
  aiKey: '', // interim: Claude key typed into this phone (docs/decisions/0006)
  tcgKey: '', // optional pokemontcg.io key
  defaultPct: 70,
  activeBucket: '',
  tapTipSeen: false,
};

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

/** Merges a change into the live settings object and saves it. */
export function saveSettings(settings, patch) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (e) { /* private mode: keep going with in-memory settings */ }
  return settings;
}
