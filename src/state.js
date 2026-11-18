// state.js — the one shared object the screens read from. Buckets live in `app.state`
// (owned by the storage adapter); everything else here is per-session.

import { loadSettings } from './settings.js';

export const app = {
  settings: loadSettings(),
  storage: null, // set in main.js
  scanner: null, // set in main.js
  ai: null, // set in main.js
  state: { buckets: [] },
  photos: {}, // item id -> thumbnail data URL
  filter: 'all', // 'all' | 'review'
  hooks: { updateChip() {} },
};

export const bucketOf = (id) => app.state.buckets.find((b) => b.id === id);
export const activeBucket = () => bucketOf(app.settings.activeBucket) || app.state.buckets[0];

export function findItem(id) {
  for (const b of app.state.buckets) {
    const it = b.items.find((x) => x.id === id);
    if (it) return { b, it };
  }
  return null;
}

export const allItems = () => app.state.buckets.flatMap((b) => b.items);
