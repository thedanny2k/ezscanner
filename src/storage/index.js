// storage/index.js — where buckets live. Same idea as the price providers: one interface,
// two implementations. 'local' = IndexedDB on the phone (works offline, the prototype's model);
// 'supabase' = the shared team database (v0.3). The UI only ever calls these methods.
//
// Storage interface:
//   load()                      -> { buckets: Bucket[] }
//   saveBucket(bucket)          -> void   (name, notes, paid, offer %, min value)
//   deleteBucket(bucketId)      -> void
//   saveItem(bucketId, item)    -> void   (insert or update one scanned card)
//   deleteItem(bucketId, itemId)-> void
//   moveItem(from, to, itemId) -> void
//   flush()                     -> void   (write pending changes now)
//   savePhoto(itemId, dataUrl)  -> void   (small thumbnail of the scan)
//   loadPhotos()                -> { [itemId]: dataUrl }

import { createLocalStorage } from './local.js';
import { createSupabaseStorage } from './supabase.js';

export function createStorage(kind, deps = {}) {
  if (kind === 'supabase') return createSupabaseStorage(deps.client);
  return createLocalStorage();
}
