# 0002 — Accuracy over speed

**Date:** 2026-11-15 · **Status:** Accepted

## Context
The app prices lots we buy. One misidentified card in the wrong version (a reverse holo can be 10× a regular print) costs more than a whole lot's scanning bill.

## Decision
- Claude Sonnet 5.5 is the default model; Haiku 5.5 stays as a cheaper option.
- After matching, a visual double-check compares the scan against official card images.
- Anything under 85% confidence is marked "Needs review" and must be confirmed by a person.
- Every scan records the model and whether a person corrected it, so accuracy is measured, not assumed.

## Consequences
- About $10–15 per 1,000 cards with the double-check on every scan (estimate), instead of ~$0.35.
- A few seconds per card.
- A measured exact-version accuracy number for the README and resume.

## Alternatives considered
- Haiku first, Sonnet only on low confidence: cheaper, revisit after the v0.4 benchmark.
