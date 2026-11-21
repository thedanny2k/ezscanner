# Supabase setup

## Live Near Mint prices (about 10 minutes, no installs)

1. **Create the project.** supabase.com → sign up → New project (Free plan). Save the database password somewhere safe.
2. **Create the function.** Edge Functions → Deploy a new function → Via Editor. Name it `tcg-price`, replace the sample code with all of `supabase/functions/tcg-price/index.ts`, and click Deploy.
3. **Turn off JWT verification for it.** Open the function's details and switch off "Verify JWT" (or "Enforce JWT verification"), then save. It only returns public prices, and the app calls it without a key.
4. **Test it.** Copy the function URL from its page and open `URL?ids=693517` in your browser. You should see JSON with a `foil` price close to TCGplayer's Near Mint Market Price for Mega Greninja ex 116/086.
5. **Point the app at it.** Paste the URL into `LIVE_PRICES_URL` in `src/config.js`, commit and push. Settings shows "Near Mint prices: live from TCGplayer".

The repo copy of the function is the one that counts: the dashboard editor has no history, so after any change paste the repo version in again. CLI alternative: `supabase functions deploy tcg-price --no-verify-jwt`. The function answers browsers only from `https://thedanny2k.github.io` and `localhost`; set an `ALLOWED_ORIGINS` secret (comma-separated) to change that.

## Team data and keys (v0.3)

About 20 minutes more. You need the [Supabase CLI](https://supabase.com/docs/guides/cli) for the Edge Function steps.

1. **Use the same project** you made for live prices.
2. **Create the tables.** Either paste `supabase/migrations/0001_init.sql` into SQL Editor → Run, or:

   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push
   ```

3. **Turn on email sign-in.** Authentication → Providers → Email. Add your GitHub Pages URL under Authentication → URL Configuration → Redirect URLs.
4. **Fill in `src/config.js`** with the Project URL and the anon public key (Project Settings → API). The anon key is meant to be public; row-level security protects the data.
5. **Create your team.** Sign in to the app once (so your user exists), then in SQL Editor:

   ```sql
   insert into public.teams (name) values ('My repack team') returning id;

   -- use the id returned above
   insert into public.team_members (team_id, user_id, role)
   select 'TEAM-ID-HERE', id, 'owner' from auth.users where email = 'you@example.com';
   ```

   Add teammates the same way with `role = 'member'` after they sign in once.
6. **Deploy the AI function:**

   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy identify
   ```

7. **Free plan note:** free projects pause after 7 days without activity (data is kept; restore from the dashboard). Upgrade to Pro once the team relies on it weekly.

Never commit the database password, service role key or API keys.
