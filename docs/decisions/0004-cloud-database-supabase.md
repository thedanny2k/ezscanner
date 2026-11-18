# 0004 — Supabase for team data

**Date:** 2026-11-16 · **Status:** Accepted (supersedes the prototype's per-phone storage)

## Context
The prototype stored buckets in IndexedDB on each phone. That survives closing the app and restarting the phone, but not a lost or replaced phone, a deleted Home Screen icon or cleared Safari data, and teammates can't see each other's lots. For a business tracking money paid on lots, that's too fragile.

## Decision
Use Supabase: Postgres for buckets and items, email sign-in, row-level security scoped to a team, Storage for scan thumbnails, Edge Functions for anything that needs a secret. Keep an offline copy in IndexedDB so scanning works with bad signal.

## Consequences
- Data survives any one phone and is shared live across the team.
- Free plan: 500 MB database, but projects pause after 7 days without activity. Move to Pro ($25/month) once the team relies on it weekly.
- Storage sits behind an interface (`src/storage/`), like price providers.

## Alternatives considered
- **Per-phone storage + CSV sharing** — no setup, but fragile and not shared.
- **Firebase** — comparable; Supabase chosen for Postgres and SQL row-level security, which read well in a portfolio.
