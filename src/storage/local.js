// storage/local.js — buckets in IndexedDB on this phone.
// Survives closing the app and restarting the phone. Not shared, and lost with the phone,
// which is why the team version moves to Supabase (docs/decisions/0004-cloud-database-supabase.md).
// If IndexedDB is unavailable (some private-browsing modes) it keeps working in memory only.

function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB is not available'));
    const r = indexedDB.open('ezscanner', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('kv');
      r.result.createObjectStore('photos');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function createLocalStorage() {
  let dbp = null;
  let state = { buckets: [] };
  let timer = null;
  let persistent = true;
  const db = () => (dbp ||= openDb());

  async function run(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  async function writeNow() {
    clearTimeout(timer);
    if (!persistent) return;
    try {
      await run('kv', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(state)), 'state'));
    } catch (e) {
      persistent = false;
    }
  }
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(writeNow, 300);
  };
  const bucket = (id) => state.buckets.find((b) => b.id === id);

  return {
    kind: 'local',
    get persistent() { return persistent; },

    async load() {
      try {
        const saved = await run('kv', 'readonly', (s) => s.get('state'));
        if (saved && Array.isArray(saved.buckets)) state = saved;
        if (globalThis.navigator?.storage?.persist) navigator.storage.persist().catch(() => {});
      } catch (e) {
        persistent = false;
      }
      // A scan that was mid-flight when the app closed can't finish; let the person fix it.
      for (const b of state.buckets) {
        for (const it of b.items) {
          if (it.status === 'reading' || it.status === 'lookup') {
            it.status = 'failed';
            it.error = 'Scan was interrupted. Tap to pick the card.';
          }
        }
      }
      return state;
    },
    flush: writeNow,

    async saveBucket(b) {
      if (!bucket(b.id)) state.buckets.push(b);
      persist();
    },
    async deleteBucket(id) {
      const b = bucket(id);
      state.buckets = state.buckets.filter((x) => x.id !== id);
      persist();
      if (b && persistent) for (const it of b.items) run('photos', 'readwrite', (s) => s.delete(it.id)).catch(() => {});
    },
    async saveItem(bucketId, item) {
      const b = bucket(bucketId);
      if (!b) throw new Error(`No bucket ${bucketId}`);
      if (!b.items.includes(item)) {
        const i = b.items.findIndex((x) => x.id === item.id);
        if (i >= 0) b.items[i] = item;
        else b.items.unshift(item);
      }
      persist();
    },
    async deleteItem(bucketId, itemId) {
      const b = bucket(bucketId);
      if (b) b.items = b.items.filter((x) => x.id !== itemId);
      persist();
      if (persistent) run('photos', 'readwrite', (s) => s.delete(itemId)).catch(() => {});
    },
    async moveItem(fromId, toId, itemId) {
      const from = bucket(fromId);
      const to = bucket(toId);
      const it = from && from.items.find((x) => x.id === itemId);
      if (!it || !to) return;
      from.items = from.items.filter((x) => x.id !== itemId);
      to.items.unshift(it);
      persist();
    },
    async savePhoto(itemId, dataUrl) {
      if (persistent) await run('photos', 'readwrite', (s) => s.put(dataUrl, itemId)).catch(() => {});
    },
    async loadPhotos() {
      if (!persistent) return {};
      try {
        const d = await db();
        return await new Promise((resolve, reject) => {
          const out = {};
          const t = d.transaction('photos', 'readonly');
          const c = t.objectStore('photos').openCursor();
          c.onsuccess = () => {
            const cur = c.result;
            if (cur) { out[cur.key] = cur.value; cur.continue(); }
          };
          t.oncomplete = () => resolve(out);
          t.onerror = () => reject(t.error);
        });
      } catch (e) {
        return {};
      }
    },
  };
}
