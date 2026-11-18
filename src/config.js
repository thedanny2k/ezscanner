// config.js — public settings. Safe to commit: the Supabase anon key is designed to be public;
// row-level security in the database decides what each signed-in user can see.
// Never put the Claude or Scrydex keys here; they live in Supabase secrets.

export const APP_VERSION = '0.2.0';

export const SUPABASE_URL = ''; // e.g. https://abcd1234.supabase.co  (fill in during v0.3)
export const SUPABASE_ANON_KEY = ''; // Project Settings -> API -> anon public key
