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
  theme: 'dark', // 'dark' | 'light' | 'system' (Settings → Appearance)
  migrated: 1,
};

/**
 * One-time changes for phones that saved settings with an older version.
 * 1 (v0.3): everyone moves to TCGplayer's own market price, the number the team is paid off.
 */
export function migrate(saved) {
  const s = { ...saved };
  if ((s.migrated || 0) < 1) {
    s.provider = 'tcgplayer';
    s.migrated = 1;
  }
  return s;
}

export function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch (e) { /* unreadable: start fresh */ }
  if (typeof saved !== 'object') saved = {};
  const first = !Object.keys(saved).length;
  const s = { ...DEFAULTS, ...(first ? {} : migrate(saved)) };
  if (!first && s.migrated !== saved.migrated) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }
  return s;
}

/** Merges a change into the live settings object and saves it. */
export function saveSettings(settings, patch) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (e) { /* private mode: keep going with in-memory settings */ }
  return settings;
}
