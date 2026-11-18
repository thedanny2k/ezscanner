# 0001 — Identify cards with Claude vision

**Date:** 2026-11-15 · **Status:** Accepted

## Context
Scanner apps generally match the photo against a library of card images (fast, no per-scan fee once built), or rent that from a service such as Ximilar. The prototype first used free OCR (Tesseract.js), which misses on holos, glare and tiny vintage numbers.

## Decision
A vision model (Claude) reads the name, collector number, set code and finish, and the card database verifies the result.

## Consequences
- No image library to build or keep current; new sets work as soon as the price source lists them.
- Costs per scan: about $0.0003 on Haiku 5.5, about $0.007 on Sonnet 5.5 (estimates).
- 1–3 seconds per card instead of sub-second. Acceptable: accuracy matters more than speed here.
- Needs a server-side key (see 0005).

## Alternatives considered
- **Free OCR only** — kept as an offline fallback, too inaccurate as the main path.
- **Ximilar** — about $7 per 1,000 cards on its $69/month plan; no cheaper and accuracy on our cards unknown.
- **Own image matching** — fastest, but building and maintaining the image library is a project of its own.
