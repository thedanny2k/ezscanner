# Decision records

Short records of the choices that shaped the project: the context, what was decided, and what it costs. New decision → copy the format, next number. A decision that's replaced stays here, marked "Superseded by NNNN".

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-ai-vision-for-card-identification.md) | Identify cards with Claude vision, not image matching or Ximilar | Accepted |
| [0002](0002-accuracy-first.md) | Accuracy over speed: Sonnet default, visual double-check, review under 85% | Accepted |
| [0003](0003-swappable-price-provider.md) | Price data behind one provider interface | Accepted |
| [0004](0004-cloud-database-supabase.md) | Supabase for team data instead of per-phone storage | Accepted |
| [0005](0005-static-frontend-edge-functions.md) | Static frontend on GitHub Pages; secrets in Supabase Edge Functions | Accepted |
| [0006](0006-interim-on-device-key.md) | Interim: Claude key on the phone until sign-in ships | Temporary |
| [0007](0007-tcgplayer-market-price-daily-file.md) | Prices straight from TCGplayer's price guide, as a daily file | Accepted |
