# 2026-11-15 — From "can I use Card Ladder's API?" to a working prototype

**Time:** one evening · **Versions:** v0.0.1 → v0.0.3 (all in `prototype/index.html`)

## Where it started

I wanted to scan PSA slabs and see their Card Ladder value. Card Ladder has no public API, and reverse-engineering their private backend would break their terms and risk my Pro account. PSA does have an official API for cert lookups. So I pivoted to the problem that actually costs my repacking business time: pricing raw Pokémon cards in big lots.

## What I built

1. **v0.0.1 — photo to price.** Take a photo, read the collector number (e.g. 025/198) and name with Tesseract.js, look the card up on pokemontcg.io, show the TCGplayer market price per version. Tested in headless Chrome with a synthetic card photo and a mocked API.
2. **v0.0.2 — live camera.** Rebuilt the UI after HoloDex and a buylist app: full-screen live camera, tap to scan, results drop into a list with a running total, a match-confidence %, and a Change sheet for fixes. Tested with Chrome's fake camera feed.
3. **v0.0.3 — business features.** Buckets for each lot, what we paid, profit, and an offer calculator that works in % or dollars. Claude vision identifies the card (Haiku 5.5, about $0.0003 a scan) with the text reader as fallback. CSV share/import between phones.

## Decisions

- **AI vision over image matching or Ximilar** — accuracy first, nothing to maintain. ([0001](../decisions/0001-ai-vision-for-card-identification.md))
- **Accuracy over speed** — Sonnet 5.5 default, visual double-check, human review under 85%. ([0002](../decisions/0002-accuracy-first.md))
- **Swappable price provider** — mid-project I found pokemontcg.io is deprecated (ends March 1, 2027). ([0003](../decisions/0003-swappable-price-provider.md))
- **Supabase instead of per-phone storage** — team data has to survive a lost phone. ([0004](../decisions/0004-cloud-database-supabase.md))
- **Keys server-side** — Edge Functions hold the Claude key. ([0005](../decisions/0005-static-frontend-edge-functions.md))

## What surprised me

- TCGplayer stopped issuing API keys, so its prices have to come through another service.
- The hardest part of accuracy isn't the card, it's the version: normal vs reverse holo can be a 10× price difference.
- Phone storage doesn't clear on restart, but it doesn't survive a lost phone either, and nobody else on the team can see it.

## Next

v0.1: turn the single file into a real repo with tests and CI, then start the data layer (ROADMAP v0.2).
