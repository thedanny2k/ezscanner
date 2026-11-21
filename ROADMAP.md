# Roadmap

Each version is a GitHub milestone; each open checkbox is an issue (`scripts/github-bootstrap.sh` creates them).

## v0.1 Foundation ✅
- [x] Keep the single-file prototype in `prototype/` as the starting point
- [x] Module structure; matching, bucket math and CSV logic ported with unit tests
- [x] Price provider interface (pokemontcg.io working, TCGdex mapped, Scrydex stub)
- [x] Supabase schema with row-level security
- [x] GitHub Actions (tests, Pages deploy), devlog, decision records

## v0.2 Working app on the modules ✅
- [x] Scanner, bucket, calculator, Change sheet, search, buckets list and settings rebuilt on `src/`
- [x] Scan pipeline as a tested module (`scan.js`)
- [x] Claude Sonnet 5.5 by default; visual double-check against official card images
- [x] Needs-review status under 85%; review cards don't count toward an offer until confirmed
- [x] Accuracy tracking per model (Settings)
- [x] Price source picker in Settings
- [x] Name: EZScanner (no Pokémon branding)

## v0.3 Team data and keys — start here
- [ ] First real-phone test: scan 20 cards with a real Claude key and note every miss
- [x] Prices straight from TCGplayer: daily price-guide file, market price only, default for everyone ([0007](docs/decisions/0007-tcgplayer-market-price-daily-file.md))
- [ ] Check prices on the first 20 real scans against each card's TCGplayer page
- [x] Collectr-style search: name, set and number prefix ("charizard 14"), tile per version, confirm before pricing
- [ ] Create the Supabase project, run the migration, add the team
- [ ] Sign-in screen (email magic link)
- [ ] Supabase storage adapter with an offline copy in IndexedDB, plus live sync
- [ ] Deploy the `identify` Edge Function and switch the app to it; remove the on-phone key

## v0.4 Field test
- [ ] 100-card benchmark: Sonnet, Haiku, text reader, Collectr
- [ ] Use it on a real lot with the team; fix what breaks
- [ ] Decide the default model and double-check mode from the numbers

## v1.0 Portfolio
- [ ] Demo mode with a sample lot for visitors
- [ ] README results table, screenshots, 30-second demo video
- [ ] GitHub release + LinkedIn post
