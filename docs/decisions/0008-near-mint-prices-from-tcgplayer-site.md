# 0008 — Near Mint prices read live from TCGplayer's site

**Date:** 2026-11-21 · **Status:** Accepted (in-house use)

## Context
Our buyers pay off TCGplayer's **Near Mint** Market Price, the number in "Price Points → Market Price" on each product page. The daily price file (0007) has one market price per version with no condition breakdown and is up to a day old, so some cards were a little off.

TCGplayer gives no new API keys. Paid services (PokemonPriceTracker, JustTCG) offer condition prices, but they're copies updated daily. TCGplayer's terms don't allow automated collection from its site without permission; the owner decided to read the prices anyway, for in-house use at low volume (a few hundred cards per lot).

A probe (`scripts/probe-tcgplayer.mjs`) on 2026-11-21 asked TCGplayer's web services about three cards from a Mac and from GitHub's servers. `mpapi.tcgplayer.com/v2/product/{id}/pricepoints` matched the product page's Near Mint Market Price to the cent on all three (Mega Greninja ex $103.02, Mega Gengar ex $530.24, Rayquaza V Alt Art $464.17), from both places. It answers with one price for "Normal" and one for "Foil".

## Decision
- A Supabase Edge Function, `tcg-price`, asks that service for up to 50 cards per call: 4 at a time, each card cached 10 minutes, with a User-Agent that says who is asking. Phones can't call TCGplayer directly (browsers block cross-site reads), so the function sits in between.
- The app prices a card live when a scan finishes, when a searched card is confirmed, when a card is changed, on CSV import, and on "Update prices".
- "Normal" and "Foil" are mapped onto the card's versions only when it's unambiguous: one foil version (ex, full arts, alt arts, SIRs) or one non-foil version. A card with Holofoil **and** Reverse Holo keeps its daily price, labelled "daily", rather than risk the wrong number.
- The daily file (0007) still drives search and scanning, and is the fallback.

## Consequences
- The price shown matches the TCGplayer product page's Near Mint Market Price at the moment it was checked; the Change sheet shows when.
- If TCGplayer changes or blocks this service, live prices stop: "Update prices" keeps earlier Near Mint numbers, new cards get daily prices labelled "daily", and nothing else breaks. The probe script and workflow make it quick to check what changed.
- This is against TCGplayer's terms; the owner accepts that risk for in-house use. Don't publish the function URL or point other apps at it.
- Supabase free projects pause after 7 days without use; restore from the dashboard.
