# 2026-11-21 — Near Mint prices, live from TCGplayer

**Milestone:** v0.3 · **Branch:** `near-mint-prices` · **Tests:** 115 unit tests + a 10-check browser run for live prices (34 and 28 on the other runs still pass)

## Goal
Our buyers pay off TCGplayer's Near Mint Market Price, the number in "Price Points" on each product page. The daily file (yesterday's work) is close but not condition-specific and up to a day old. Show that exact number instead.

## What I built
- **A probe before the build.** TCGplayer has no public API for new developers, and my workspace can't reach its site, so I wrote `scripts/probe-tcgplayer.mjs` to ask four of TCGplayer's web services about real cards and save what came back. Run from a Mac and from GitHub Actions, one service (`pricepoints`) matched the product page's Near Mint Market Price to the cent on all three cards, from both places.
- **`tcg-price`, a Supabase Edge Function.** Phones can't read another site's data, so the function asks TCGplayer for up to 50 cards per call: 4 at a time, 10-minute cache, honest User-Agent, and it only serves the app's own site.
- **`livePrices.js`.** Maps TCGplayer's "Normal" and "Foil" prices onto the card's versions, but only when that's unambiguous. Prices cards when a scan finishes, a searched card is confirmed, a card is changed, a CSV is imported, and on "Update prices".
- **Honest labels.** Anything not priced live shows a yellow **daily** tag; the Change sheet says "Near Mint market price · checked 12:40 AM" or "daily · not Near Mint–specific".

## What broke / what I learned
- **One "Foil" number can't price two foil versions.** TCGplayer answers with Normal and Foil only. For a card with Holofoil and Reverse Holo, guessing would put a Reverse Holo at the Holofoil price. Those keep the daily price, labelled, and that's fine for us: the team prices hits (ex, full arts, alt arts, SIRs), which only come in Holofoil.
- **"Update prices" shouldn't make things worse.** If the service is down, a refresh used to drop every card back to daily prices. It now keeps the earlier Near Mint numbers and says so.
- **Check before building.** The probe took ten minutes and saved building against a guessed format. The price-history service I expected to use refused every request (403); the one that worked was a different one.
- **A scan in review doesn't count yet.** My first browser check expected the bucket total to include a scan still in review. The app was right and the test was wrong.

## Numbers
- 115 unit tests (13 new: version mapping, the client's batching and cache, the function's limits and CORS).
- Live-price browser run: 10 of 10 (scan, search add, daily label, Change sheet source line, refresh, service down, reload).

## Next
Create the Supabase project, deploy `tcg-price`, fill in `LIVE_PRICES_URL`, merge the branch, and check the first 20 scans against their TCGplayer pages.
