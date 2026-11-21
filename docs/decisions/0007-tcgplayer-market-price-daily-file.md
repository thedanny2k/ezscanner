# 0007 — Prices straight from TCGplayer's price guide, as a daily file

**Date:** 2026-11-20 · **Status:** Accepted

## Context
We sell to buyers who pay off TCGplayer's **Market Price**, the figure on each product page. The first real scan showed a different number: it matched TCGplayer's lowest Near Mint listing, not the market price. The app already read the `market` field, so the problem was the data, not the code. The free sources we used are third-party copies of TCGplayer's numbers: pokemontcg.io is deprecated (no new keys, shuts off March 1, 2027) and TCGdex's TCGplayer prices are reported stale and sometimes map two versions to one listing. TCGplayer no longer gives new developers API keys.

[TCGCSV](https://tcgcsv.com) publishes TCGplayer's own API responses (sets, products, and per-version low/mid/high/market prices) once a day, free. It blocks browser requests (restrictive CORS) and asks callers to sync at most once a day from back-end code.

## Decision
- A GitHub Action (`scripts/build-prices.mjs`, run by `pages.yml` daily at 21:37 UTC, after TCGCSV's ~20:00 refresh) downloads every English Pokémon set and keeps **only single cards and only `marketPrice` per version** (`subTypeName`: Normal, Holofoil, Reverse Holofoil, 1st Edition…). It writes `prices/cards.json` and deploys it with the site.
- The phone loads that one file from the same site and searches it in memory (`src/providers/tcgplayer.js`). It never calls TCGplayer or TCGCSV.
- If a printing has no market price, the app shows none. It never falls back to a listing price.
- Polite by design: custom User-Agent, 120 ms between requests, about 450 requests a day; pushes during the day reuse the live file when TCGCSV hasn't updated; if TCGCSV is down, the live file is kept so code changes still deploy.
- TCGplayer becomes the default provider; phones that saved the old default move over once.

## Consequences
- The price shown is TCGplayer's own Market Price for that product and version, the same number buyers use. It is per version, not per condition (it is not the Near Mint-filtered number), and it is up to a day old.
- Lookups are instant and free, with no key and no rate limit; the app needs one download of a few hundred KB (compressed) per session.
- Card images come from TCGplayer's CDN, so the visual double-check compares against the exact product being priced.
- We depend on TCGCSV, a community service. If it disappears, the provider interface (0003) lets us switch, and the last published file keeps working meanwhile.
- GitHub pauses scheduled workflows after 60 days without a commit. If prices stop updating, re-enable the workflow under Actions.
