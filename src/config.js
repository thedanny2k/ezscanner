// config.js — public settings. Safe to commit: the Supabase anon key is designed to be public;
// row-level security in the database decides what each signed-in user can see.
// Never put the Claude or Scrydex keys here; they live in Supabase secrets.

export const APP_VERSION = '0.2.0';

export const SUPABASE_URL = 'https://jvktzayqejwduyiublyp.supabase.co/functions/v1/tcgprice'; // e.g. https://abcd1234.supabase.co  (fill in during v0.3)

// Near Mint prices read live from TCGplayer (supabase/functions/tcg-price, docs/supabase-setup.md).
// Empty = off: the app uses the daily TCGplayer price file only and labels those prices "daily".
export const LIVE_PRICES_URL = ''; // e.g. https://abcd1234.supabase.co/functions/v1/tcg-price
export const SUPABASE_ANON_KEY = ''; // Project Settings -> API -> anon public key
