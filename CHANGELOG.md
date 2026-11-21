# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow the milestones in [ROADMAP.md](ROADMAP.md).

## [Unreleased]
### Changed
- Prices now come straight from TCGplayer's price guide, and the app shows only TCGplayer's **Market Price** for each version: the number we're paid off. A GitHub Action rebuilds `prices/cards.json` from tcgcsv.com (a public mirror of TCGplayer's API) every day after TCGplayer's numbers refresh, and publishes it with the site. Lookups are instant, free and need no key ([decision 0007](docs/decisions/0007-tcgplayer-market-price-daily-file.md)).
- Phones that saved the old default price source are moved to TCGplayer once. Picking another source in Settings afterwards sticks.
- Card images for the visual double-check come from TCGplayer's own product images, and "View on TCGplayer" opens the exact product page.
- The "Pick the right card" search on a scanned card uses the same search rules, so "charizard 14" works there too. The old add-by-search sheet is replaced by the search screen.
### Added
- **Card search, Collectr style.** The search button opens a full-screen search: type "charizard 14" and every Charizard numbered 14… shows up (exact number first), "celebi sky" finds Celebi from Skyridge, "pikachu 25/198" finds exactly that card. Every word must match the name, set, set code or the start of the collector number, and results update as you type. Results are a two-column grid with one tile per version and no prices.
- Tapping a tile opens "Is this the card?": pick the version and how many, then add. Only then is today's TCGplayer market price pulled and the cards go into the bucket. Tiles show how many of that version are already in the bucket.
- Recent searches (this phone), sort by best match, newest set, oldest set or card number, and a camera button that goes straight back to the scanner.
- The search screen shows what's loaded ("TCGplayer data: 222 sets · 31,402 cards · prices from …") and warns when a test price file with only some sets is in use.
- `scripts/build-prices.mjs` (`npm run prices`), `src/providers/tcgplayer.js` and `tcgplayer-data.js`, with tests built on tcgcsv-shaped sample data.
- If the AI can't load the candidate images, the double-check is skipped with a one-time notice instead of sending every scan to review.
### Fixed
- AI scans failed on Claude Sonnet 5.5 with "To turn thinking off on this model, send between_tools". Each model now gets the thinking setting it accepts (Sonnet 5.5: `between_tools`, Haiku 5.5: `disabled`), and if the API ever rejects it the app retries once with the model's default instead of failing the scan.

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
