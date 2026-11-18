-- 0001_init.sql — EZScanner schema: teams, buckets (lots), scanned items.
-- Row-level security: a signed-in user only ever sees their own team's data.
-- Run with `supabase db push`, or paste into the Supabase SQL editor.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.buckets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null,
  notes text not null default '',
  paid numeric(12, 2),
  offer_pct numeric(5, 2) not null default 70 check (offer_pct between 0 and 100),
  min_value numeric(10, 2) not null default 0 check (min_value >= 0),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  bucket_id uuid not null references public.buckets (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,  -- copied from the bucket by trigger
  status text not null default 'done' check (status in ('done', 'review', 'failed')),
  card jsonb,                                  -- the app's Card shape (src/providers/provider.js)
  source text,                                 -- price provider id
  source_id text,                              -- card id inside that provider
  printing text,                               -- canonical printing key (src/cards.js)
  market numeric(10, 2),                       -- TCGplayer market price at scan or last refresh
  confidence smallint check (confidence between 0 and 100),
  confirmed boolean not null default false,    -- a person picked or confirmed the card
  corrected boolean not null default false,    -- a person changed the AI's answer (accuracy stats)
  model text,                                  -- AI model that scanned it; null when added by search
  read_text text,                              -- what the AI read, kept for debugging misses
  photo_path text,                             -- Storage path of the scan thumbnail
  scanned_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index buckets_team_id_idx on public.buckets (team_id);
create index items_bucket_id_idx on public.items (bucket_id);

-- Is the signed-in user on this team? (security definer so the policies below don't recurse)
create or replace function public.is_team_member(t uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.team_members where team_id = t and user_id = auth.uid());
$$;

-- An item always belongs to its bucket's team, whatever the client sends.
create or replace function public.items_team_from_bucket()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.team_id := (select b.team_id from public.buckets b where b.id = new.bucket_id);
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_team_from_bucket before insert or update of bucket_id on public.items
  for each row execute function public.items_team_from_bucket();
create trigger buckets_touch before update on public.buckets
  for each row execute function public.touch_updated_at();
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.buckets enable row level security;
alter table public.items enable row level security;

create policy "members read their team" on public.teams
  for select to authenticated using (public.is_team_member(id));
create policy "members read their teammates" on public.team_members
  for select to authenticated using (public.is_team_member(team_id));
create policy "members manage team buckets" on public.buckets
  for all to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy "members manage team items" on public.items
  for all to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

-- Scan thumbnails live in a private Storage bucket at <team_id>/<item_id>.jpg
insert into storage.buckets (id, name, public) values ('scans', 'scans', false) on conflict (id) do nothing;

create policy "members read team scans" on storage.objects
  for select to authenticated
  using (bucket_id = 'scans' and public.is_team_member(((storage.foldername(name))[1])::uuid));
create policy "members upload team scans" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'scans' and public.is_team_member(((storage.foldername(name))[1])::uuid));
create policy "members delete team scans" on storage.objects
  for delete to authenticated
  using (bucket_id = 'scans' and public.is_team_member(((storage.foldername(name))[1])::uuid));
