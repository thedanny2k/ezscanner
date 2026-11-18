# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow the milestones in [ROADMAP.md](ROADMAP.md).

## [Unreleased]

## [0.2.0] - 2026-11-16 — Working app on the modules
### Added
- The full scanner now runs on `src/`: live camera, tap to scan, buckets, offer calculator, Change sheet, search, CSV share/import, price refresh.
- `scan.js`: the scan pipeline as a DOM-free module, unit-tested with fake AI and price data.
- Visual double-check: Claude compares the scan with official images of the top candidates and sets the version (Settings: every scan / only when unsure / off).
- Needs review: scans under 85% are flagged, filtered with one tap, and left out of market value and offers until a person confirms them.
- Accuracy per reader (Sonnet, Haiku, text reader) in Settings, from scans people did or didn't have to fix.
- Price source picker; each saved card remembers which source it came from.
### Changed
- Claude Sonnet 5.5 is the default model.
- `identify` Edge Function handles both reading and double-checking, and only fetches candidate images from known card-image hosts.
### Known gaps
- AI calls still go straight from the phone with a key in Settings (decision 0006) until sign-in ships in v0.3.
- Not yet run on a real phone, against the live Claude API, or against live price data.

## [0.1.0] - 2026-11-16 — Foundation
### Added
- Named the app EZScanner.
- Module structure under `src/` with matching, bucket math, CSV and accuracy logic ported from the prototype.
- Price provider interface with pokemontcg.io (working), TCGdex (mapped, unverified) and Scrydex (stub).
- Storage interface: IndexedDB adapter (working), Supabase adapter (stub).
- Supabase schema with row-level security and a private Storage bucket for scan thumbnails.
- `identify` Edge Function that keeps the Claude key server-side (not deployed yet).
- 41 unit tests (Vitest), GitHub Actions for tests and Pages deploys, benchmark scoring script.
- Devlog, decision records, roadmap, issue and PR templates.

## [0.0.3] - 2026-11-15 — Prototype: buckets and AI
### Added
- Buckets with market value, paid, profit and a two-way offer calculator.
- Claude vision recognition with the free text reader as fallback; CSV share and import.

## [0.0.2] - 2026-11-15 — Prototype: live camera
### Added
- Full-screen live camera, tap to scan, scanning queue, bottom-sheet list with totals.

## [0.0.1] - 2026-11-15 — Prototype: first scan
### Added
- Photo -> text reader -> pokemontcg.io lookup -> TCGplayer market price.
