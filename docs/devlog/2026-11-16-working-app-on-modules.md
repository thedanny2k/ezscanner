# 2026-11-16 — The real app, rebuilt on tested modules

**Milestones:** v0.1 Foundation, v0.2 Working app · **Tests:** 55 unit tests + a 29-check browser run

## Goal
Stop having two things (a working single-file prototype and an empty "proper" repo). Make the proper repo the app.

## What I built
- **Structure first (v0.1).** Split the prototype's logic into modules with unit tests: number parsing and matching, bucket math, CSV, accuracy stats, a price-provider contract, a storage contract.
- **The pipeline as its own module (v0.2).** `scan.js` runs photo → read → database match → double-check → status with everything injected, so tests drive it with fake AI answers. Ten tests cover the cases that cost money: wrong set, wrong version, unsure, no match.
- **Visual double-check.** After the database match, Claude sees the scan next to the official images of the top candidates and says which one it is and what finish it has. Agreement raises confidence to 95; "not sure" or "none of these" sends the card to review.
- **Needs review.** Under 85% the card is flagged and its value is left out of the market total and the offer until someone taps "This is the right card and version".
- **Accuracy tracking.** Each scan stores its reader; fixing the card or version by hand marks it corrected. Settings shows accuracy per reader.

## What broke / what I learned
- **A CSS class collision.** Card rows got the class `done` from their status, and the Done button's `.done` style painted whole rows yellow. Statuses are now prefixed (`st-done`). I only saw it because I looked at the screenshot instead of trusting the passing checks.
- **The text reader should not be trusted with versions.** It can't see holo vs reverse holo, and without a set code its best score is 80%, so its scans land in review. That turned out to be the right behaviour for an accuracy-first app.
- **My own test was wrong before the app was.** Scans "hung" in the browser test because the test tapped twice inside the app's 450 ms double-tap guard.

## Numbers
- 55 unit tests passing; browser run: 29 of 29 checks.
- Request sizes: about 64 KB per scan image, 56 KB for the double-check copy.
- Not measured yet: real accuracy and real cost. Those need a real phone and a real key (v0.3, first issue).

## Next
Scan 20 real cards with a real key and write down every miss. Then the TCGdex check and Supabase.
