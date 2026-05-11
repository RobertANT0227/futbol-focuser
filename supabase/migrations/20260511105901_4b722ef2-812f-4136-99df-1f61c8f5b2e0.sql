
-- Helper: is_premium_or_owner
create or replace function public.is_premium_or_owner(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'owner')
      or exists (
        select 1 from public.account_meta am
        where am.user_id = _user_id
          and am.account_type = 'premium'
          and not am.blocked
          and (am.expires_at is null or am.expires_at > now())
      )
$$;

-- Leagues
create table public.cp_leagues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  country text,
  season text not null default '2024/25',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name, season)
);
alter table public.cp_leagues enable row level security;
create policy "cp_leagues owner read"   on public.cp_leagues for select using (auth.uid() = owner_id and public.is_premium_or_owner(auth.uid()));
create policy "cp_leagues owner insert" on public.cp_leagues for insert with check (auth.uid() = owner_id and public.is_premium_or_owner(auth.uid()));
create policy "cp_leagues owner update" on public.cp_leagues for update using (auth.uid() = owner_id);
create policy "cp_leagues owner delete" on public.cp_leagues for delete using (auth.uid() = owner_id);
create trigger cp_leagues_touch before update on public.cp_leagues for each row execute function public.touch_updated_at();

-- Teams
create table public.cp_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.cp_leagues(id) on delete cascade,
  owner_id uuid not null,
  name text not null,
  playstyle text,
  tags text[] default '{}',
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (league_id, name)
);
alter table public.cp_teams enable row level security;
create policy "cp_teams owner read"   on public.cp_teams for select using (auth.uid() = owner_id and public.is_premium_or_owner(auth.uid()));
create policy "cp_teams owner insert" on public.cp_teams for insert with check (auth.uid() = owner_id and public.is_premium_or_owner(auth.uid()));
create policy "cp_teams owner update" on public.cp_teams for update using (auth.uid() = owner_id);
create policy "cp_teams owner delete" on public.cp_teams for delete using (auth.uid() = owner_id);
create index cp_teams_league_idx on public.cp_teams(league_id);
create trigger cp_teams_touch before update on public.cp_teams for each row execute function public.touch_updated_at();

-- Matches
create table public.cp_matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.cp_leagues(id) on delete cascade,
  owner_id uuid not null,
  season text not null default '2024/25',
  match_date date,
  home text not null,
  away text not null,
  stats jsonb not null default '{}'::jsonb,
  odds jsonb not null default '{}'::jsonb,
  source_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, season, match_date, home, away)
);
alter table public.cp_matches enable row level security;
create policy "cp_matches owner read"   on public.cp_matches for select using (auth.uid() = owner_id and public.is_premium_or_owner(auth.uid()));
create policy "cp_matches owner insert" on public.cp_matches for insert with check (auth.uid() = owner_id and public.is_premium_or_owner(auth.uid()));
create policy "cp_matches owner update" on public.cp_matches for update using (auth.uid() = owner_id);
create policy "cp_matches owner delete" on public.cp_matches for delete using (auth.uid() = owner_id);
create index cp_matches_lookup_idx on public.cp_matches(league_id, season, match_date);
create trigger cp_matches_touch before update on public.cp_matches for each row execute function public.touch_updated_at();

-- Imports
create table public.cp_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  league_id uuid references public.cp_leagues(id) on delete set null,
  league_name text,
  season text,
  file_type text,
  file_name text,
  rows_imported integer default 0,
  duplicates integer default 0,
  created_at timestamptz not null default now()
);
alter table public.cp_imports enable row level security;
create policy "cp_imports owner read"   on public.cp_imports for select using (auth.uid() = owner_id and public.is_premium_or_owner(auth.uid()));
create policy "cp_imports owner insert" on public.cp_imports for insert with check (auth.uid() = owner_id and public.is_premium_or_owner(auth.uid()));
create policy "cp_imports owner delete" on public.cp_imports for delete using (auth.uid() = owner_id);

-- Watchlist
create table public.cp_watchlist (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.cp_watchlist enable row level security;
create policy "cp_watchlist owner read"   on public.cp_watchlist for select using (auth.uid() = owner_id and public.is_premium_or_owner(auth.uid()));
create policy "cp_watchlist owner insert" on public.cp_watchlist for insert with check (auth.uid() = owner_id and public.is_premium_or_owner(auth.uid()));
create policy "cp_watchlist owner delete" on public.cp_watchlist for delete using (auth.uid() = owner_id);
