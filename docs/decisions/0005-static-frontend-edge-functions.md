# 0005 — Static frontend, secrets in Edge Functions

**Date:** 2026-11-16 · **Status:** Accepted

## Context
The prototype called Claude straight from the phone, so every phone held the API key and anyone with the phone could extract it.

## Decision
The app stays a static site on GitHub Pages (free, deploys on every push). Anything needing a secret goes through a Supabase Edge Function: `identify` holds the Claude key and only serves signed-in members of a team. The browser only ever holds the public Supabase anon key.

## Consequences
- No server to run; secrets never reach phones or the repo.
- Per-user limits and spend controls become possible in one place.
- The Edge Function adds a network hop (small next to the AI call itself).
