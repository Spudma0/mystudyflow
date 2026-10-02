-- MyStudyFlow database schema
--
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query →
-- paste → Run. Safe to re-run; every statement is idempotent.
--
-- Two tables:
--   profiles   – the structured account info collected during registration
--   user_data  – one JSON blob per app store, used to restore a user's timetable,
--                reminders and study history on a new device
--
-- Both are protected by row level security so a signed-in user can only ever
-- touch their own row. auth.users itself is managed by Supabase.

-- ---------------------------------------------------------------- profiles --

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text        not null default '',
  school       text        not null default '',
  year_level   text        not null default '',
  -- Theme picked during onboarding, so it follows the account across devices.
  accent_color text        not null default '#8B5CF6',
  base_color   text        not null default '#0A0A0F',
  card_color   text        not null default '#15151F',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by their owner" on public.profiles;
create policy "profiles are readable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles are insertable by their owner" on public.profiles;
create policy "profiles are insertable by their owner"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles are updatable by their owner" on public.profiles;
create policy "profiles are updatable by their owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Give every new signup an empty profile row so the app always has one to read.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------- user_data --

-- One row per user per store ('timetable', 'reminders', 'subject-data',
-- 'study-topics', 'app-open'). Storing each store as JSON keeps the sync layer
-- in step with the app's zustand stores without a migration per feature.
create table if not exists public.user_data (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  store_key  text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, store_key)
);

alter table public.user_data enable row level security;

drop policy if exists "user_data is readable by its owner" on public.user_data;
create policy "user_data is readable by its owner"
  on public.user_data for select
  using (auth.uid() = user_id);

drop policy if exists "user_data is writable by its owner" on public.user_data;
create policy "user_data is writable by its owner"
  on public.user_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_data is updatable by its owner" on public.user_data;
create policy "user_data is updatable by its owner"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_data is deletable by its owner" on public.user_data;
create policy "user_data is deletable by its owner"
  on public.user_data for delete
  using (auth.uid() = user_id);

-- Keep updated_at honest so last-write-wins sync can compare timestamps.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch
  before update on public.user_data
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();
