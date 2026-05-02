-- Enum tip cont
create type public.account_type as enum ('trial', 'premium');

-- account_meta: 1 rând per user
create table public.account_meta (
  user_id uuid primary key,
  account_type public.account_type not null default 'trial',
  expires_at timestamptz,
  blocked boolean not null default false,
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_meta enable row level security;

create policy "Owners can view all account meta"
  on public.account_meta for select to authenticated
  using (public.has_role(auth.uid(), 'owner'));

create policy "Users can view own account meta"
  on public.account_meta for select to authenticated
  using (auth.uid() = user_id);

-- audit log
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_username text,
  action text not null,
  target_user_id uuid,
  target_username text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create policy "Owners can view audit log"
  on public.admin_audit_log for select to authenticated
  using (public.has_role(auth.uid(), 'owner'));

-- helper: cont activ?
create or replace function public.is_account_active(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (
      select not blocked
        and (expires_at is null or expires_at > now())
      from public.account_meta where user_id = _user_id
    ),
    true -- dacă nu există meta (ex: owner), considerăm activ
  )
$$;

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger account_meta_touch
before update on public.account_meta
for each row execute function public.touch_updated_at();

-- index pe expires_at
create index idx_account_meta_expires on public.account_meta(expires_at) where expires_at is not null;
create index idx_audit_log_created on public.admin_audit_log(created_at desc);
create index idx_audit_log_target on public.admin_audit_log(target_user_id);