# Supabase setup (v0.3)

About 20 minutes. You need the [Supabase CLI](https://supabase.com/docs/guides/cli) for the Edge Function steps.

1. **Create the project.** supabase.com → New project. Save the database password somewhere safe.
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
