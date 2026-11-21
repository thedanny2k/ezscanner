# 2026-11-20 — Prices straight from TCGplayer, and search like Collectr

**Milestone:** v0.3 · **Tests:** 98 unit tests + browser runs of 34 and 26 checks

## Goal
1. The first real scan showed TCGplayer's lowest Near Mint listing instead of the Market Price. Our buyers pay off the Market Price, so the app has to show that number and nothing else.
2. When a scan misses, finding the card by hand should be as quick as in Collectr: type "charizard 14", see every match, tap the right one.

## What I built
- **A daily price file.** `scripts/build-prices.mjs` downloads TCGplayer's whole English Pokémon price guide from TCGCSV (a public, daily mirror of TCGplayer's API), keeps single cards and only the market price per version, and writes `prices/cards.json`. The Pages workflow now runs every day after TCGplayer's numbers refresh and publishes the file with the site.
- **A TCGplayer provider.** `src/providers/tcgplayer.js` loads that file once and searches it in memory: collector number and total first, then name. Card images and "View on TCGplayer" now point at the exact TCGplayer product being priced.
- **Safe rollouts.** Pushes during the day reuse the live file when TCGCSV hasn't updated (one request instead of ~450). If TCGCSV is down, the live file is kept so the site still deploys.
- **Everyone moves over once.** A settings migration switches phones off the old default.
- **Search like Collectr.** `src/search.js` makes every typed word match the card's name, set, set code or the start of its number, so "charizard 14" lists Charizard 14 first and then 140–149, and "celebi sky" finds the Skyridge Celebi. Because the whole price guide is already in memory, results update on every keystroke. The screen (`ui/search.js`) shows a two-column grid with one tile per version, recent searches, sorting, and a camera button back to the scanner.
- **Confirm, then price.** Tiles carry no prices. Tapping one opens "Is this the card?" with version and quantity; the market price is pulled only when the card is confirmed and added.

## What broke / what I learned
- **The bug wasn't in the code.** The app already read `market`. The free APIs we used were copies of TCGplayer's data that had gone stale or mapped versions wrongly. Going to the source fixed it; reading the field more carefully wouldn't have.
- **TCGCSV can't be called from a phone.** It blocks browser requests on purpose and asks for one sync a day. Moving the download into GitHub Actions respected that, and made lookups instant and free.
- **"14" shouldn't mean "anything with a 14 in it".** Collectr also matches set totals (a search for "charizard 14" shows a 150/147 card). I kept it to the start of the collector number, with the exact number ranked first, so the list stays short enough to scan by eye during a buy.
- **TCGplayer lists more lookalikes.** Base Set and Base Set (Shadowless) share "4/102"; text alone can't tell them apart, so those scans go to review unless the visual double-check settles it. That's the accuracy-first behaviour we want.

## Numbers
- 84 unit tests (21 new: file format, set and card name cleanup, number parsing, search, migration).
- Build script checked against a fake TCGCSV server in four cases: first deploy, same-day reuse, TCGCSV down with a live file, TCGCSV down without one.
- Browser run: 34 of 34, including market-only version chips, the TCGplayer product link, and "Update prices" picking up a new day's file.
- Search: 14 new unit tests; a 26-check browser run (typing, ranking, tiles per version with no prices, confirm with quantity, price pulled on add, recent searches, sorting, 40-tile paging, back to the scanner).
- Searching a full-size price file (30,000 cards) takes 3–10 ms per keystroke on a laptop.

## Next
Run the Deploy workflow once so the first price file is published, then check the first 20 real scans' prices against their TCGplayer pages, and time a hand search against Collectr on the same cards.
