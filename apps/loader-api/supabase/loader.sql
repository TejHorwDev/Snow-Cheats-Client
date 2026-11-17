-- SNOW LOADER — catalogue and links
--
-- Applied to the project `Snow Cheats Loader` (ref pqomyuqirfygoccsmbid) as the
-- migration `loader_catalogue`. Kept here so the schema exists in the repository
-- rather than only in a dashboard, and so the deployment can be rebuilt from
-- nothing.
--
-- The tables are `loader_*`, not `apps`/`config`, and the sign-in service's are
-- `auth_*` (see `auth.sql`). One owner, one database, and a prefix per service is
-- what keeps two halves of one product from reading each other's rows by accident.
--
-- Safe to run again: every object is created only if it is missing.

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------- apps ----

create table if not exists public.loader_apps (
  id uuid primary key default gen_random_uuid(),

  name text not null check (length(trim(name)) between 1 and 80),
  description text not null default '',
  version text not null default '1.0.0',

  image_url text not null default '',
  exe_url text not null default '',

  -- The product's id in SNOW Auth. Empty means the app is not gated.
  keyauth_app_id text not null default '',

  -- The kill switch: `locked` hides a product from every user, including the ones
  -- who paid for it.
  status text not null default 'active' check (status in ('active', 'locked')),

  -- Optional integrity. When a hash is published the loader deletes a file that
  -- arrives with different bytes instead of installing it.
  exe_sha256 text not null default '',
  exe_bytes bigint not null default 0,

  -- How the loader draws the card artwork: pixels of blur, percent of dark. Both 0 is
  -- sharp and untouched. Added by `loader-card-frame.sql`.
  image_blur integer not null default 0,
  image_dim integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loader_apps_created_at_idx on public.loader_apps (created_at asc);

-- --------------------------------------------------------------- config ----

create table if not exists public.loader_config (
  key text primary key,
  value text not null default ''
);

-- ------------------------------------------------------------ updated_at ---

create or replace function public.loader_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists loader_apps_touch on public.loader_apps;
create trigger loader_apps_touch
  before update on public.loader_apps
  for each row execute function public.loader_touch_updated_at();

-- ------------------------------------------------------------------ RLS ----
--
-- Enabled with no policy at all, which is deliberate: the anon key can read
-- nothing and write nothing. Every read and write goes through the API, which holds
-- the service role key on the server.

alter table public.loader_apps enable row level security;
alter table public.loader_config enable row level security;

revoke all on public.loader_apps from anon, authenticated;
revoke all on public.loader_config from anon, authenticated;

-- ---------------------------------------------------------------- seeds ----
--
-- The one link key, and nothing else. No demo apps: an empty catalogue is a true
-- statement about a new install, and a fake one is a lie that ships.

insert into public.loader_config (key, value) values ('website', '')
on conflict (key) do nothing;

-- --------------------------------------------------------------- bucket ----
--
-- Public, 50 MB per file — the free plan's ceiling, and the truth is better than a
-- promise the plan cannot keep.
--
-- Public because artwork and film are the picture in a shop window and the rule for
-- this deployment is that they are served by the bucket directly: a card clip must
-- not be relayed through a free API instance that has to wake up first. Installers
-- are the exception and are never stored here — they live on GitHub Releases or a
-- file host, and the panel holds the link.
--
-- Re-running this row updates it, so a project created by clicking through the
-- dashboard ends up with the same bucket the code expects.

insert into storage.buckets (id, name, public, file_size_limit)
values ('loader-files', 'loader-files', true, 52428800)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;
