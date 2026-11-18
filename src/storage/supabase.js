// storage/supabase.js — the shared team database. STATUS: planned for v0.3.
// Tables and security rules: supabase/migrations/0001_init.sql
//
// Mapping:
//   Bucket  <-> public.buckets  (id, team_id, name, notes, paid, offer_pct, min_value, created_at)
//   item    <-> public.items    (id, bucket_id, team_id, status, card jsonb, printing, market,
//                                confidence, confirmed, corrected, model, photo_path, created_at)
//   photo   <-> Storage bucket "scans" at `${team_id}/${item_id}.jpg`
//
// Plan for v0.3:
//   1. Sign in (email magic link) and read the user's team from public.team_members.
//   2. load(): select buckets + items for the team; keep a copy in IndexedDB for offline use.
//   3. save*/delete*: write locally first, then upsert to Supabase; retry when back online.
//   4. Subscribe to Realtime changes so teammates see new scans live.

const notBuilt = () => {
  throw new Error('Supabase storage is not built yet (see ROADMAP.md, v0.3).');
};

export function createSupabaseStorage(client) {
  void client;
  return {
    kind: 'supabase',
    load: notBuilt,
    saveBucket: notBuilt,
    deleteBucket: notBuilt,
    saveItem: notBuilt,
    deleteItem: notBuilt,
    moveItem: notBuilt,
    flush: notBuilt,
    savePhoto: notBuilt,
    loadPhotos: notBuilt,
  };
}
