# 0006 — Interim: Claude key on the phone until sign-in ships

**Date:** 2026-11-16 · **Status:** Accepted, temporary (ends with v0.3)

## Context
Decision 0005 puts the Claude key in a Supabase Edge Function. That needs a Supabase project and sign-in, which arrive in v0.3. The app has to be testable on real cards before then.

## Decision
`recognize/ai.js` sends every AI task through a transport. v0.2 ships `directTransport`: the phone calls the Claude API with a key typed into Settings. `edgeTransport` (the Edge Function) is written and replaces it in v0.3 by changing one line in `main.js`.

## Consequences
- The app works today with no backend.
- Anyone holding a phone could read the key. Mitigation: a dedicated key, prepaid credits, auto-reload off, and only the owner's phones until v0.3.
- Removing the Settings key field is part of the v0.3 checklist.
