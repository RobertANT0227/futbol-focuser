
-- Enum pentru roluri
create type public.app_role as enum ('owner', 'client');

-- Tabela profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

-- Tabela user_roles (separată pentru a preveni privilege escalation)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- Tabela login_attempts (pentru blocare după 3 încercări)
create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  attempted_at timestamptz not null default now(),
  success boolean not null default false
);
create index idx_login_attempts_username_time on public.login_attempts (username, attempted_at desc);

-- Tabela robot_usage (pentru quota client 3/zi)
create table public.robot_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  used_at timestamptz not null default now()
);
create index idx_robot_usage_user_time on public.robot_usage (user_id, used_at desc);

-- Security definer function pentru verificare rol (evită recursivitatea RLS)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- Trigger: la signup, creează profilul automat din metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.login_attempts enable row level security;
alter table public.robot_usage enable row level security;

-- Policies profiles
create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Owners can view all profiles"
  on public.profiles for select
  to authenticated
  using (public.has_role(auth.uid(), 'owner'));

create policy "Owners can delete profiles"
  on public.profiles for delete
  to authenticated
  using (public.has_role(auth.uid(), 'owner'));

-- Policies user_roles
create policy "Users can view own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Owners can view all roles"
  on public.user_roles for select
  to authenticated
  using (public.has_role(auth.uid(), 'owner'));

create policy "Owners can insert roles"
  on public.user_roles for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'owner'));

create policy "Owners can delete roles"
  on public.user_roles for delete
  to authenticated
  using (public.has_role(auth.uid(), 'owner'));

-- Policies login_attempts (lectură numai pentru owner; scriere prin edge function service role)
create policy "Owners can view login attempts"
  on public.login_attempts for select
  to authenticated
  using (public.has_role(auth.uid(), 'owner'));

-- Policies robot_usage
create policy "Users can view own robot usage"
  on public.robot_usage for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Owners can view all robot usage"
  on public.robot_usage for select
  to authenticated
  using (public.has_role(auth.uid(), 'owner'));

create policy "Users can insert own robot usage"
  on public.robot_usage for insert
  to authenticated
  with check (auth.uid() = user_id);
