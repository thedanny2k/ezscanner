# 0003 — Price data behind one provider interface

**Date:** 2026-11-15 · **Status:** Accepted

## Context
The prototype used pokemontcg.io. Mid-project its docs announced deprecation: no new API keys, existing access through March 1, 2027, successor Scrydex (paid, from $29/month). TCGplayer itself stopped granting new API access. Free alternatives with TCGplayer prices exist (TCGdex, PokéWallet) but their data quality is unproven for us.

## Decision
Every price source implements one interface (`src/providers/provider.js`): `findCards` and `getByIds`, returning the app's own `Card` shape with prices keyed by canonical printing names. Each saved card records its `source` and `sourceId`.

## Consequences
- Switching sources is a setting, not a rewrite.
- Unit tests check every provider against the contract and that two providers produce the same Card for the same card.
- pokemontcg.io stays the default until TCGdex passes the v0.3 check.

## Alternatives considered
- Hard-code Scrydex now: reliable, but a monthly cost before we know we need it.

**Update 2026-11-20:** the default is now TCGplayer's own price guide, published daily with the site ([0007](0007-tcgplayer-market-price-daily-file.md)).
