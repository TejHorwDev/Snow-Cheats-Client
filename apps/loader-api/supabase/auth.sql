-- SNOW CHEATS — the sign-in service
--
-- The three tables the loader's `/v1/*` contract needs: who the accounts are, what
-- sessions they hold, and which catalogue products each one owns.
--
-- Folder naming: `auth_*`, because these belong to the sign-in service and not to
-- the catalogue (those are `loader_*`). Both live in one project, one owner, one
-- backup.
--
-- Safe to run again: every object is created only if it is missing.

-- ---------------------------------------------------------------- users ----

create table if not exists public.auth_users (
  id uuid primary key default gen_random_uuid(),

  -- Lowercased and trimmed before it gets here; the API refuses anything that is
  -- not `[a-z0-9._-]{3,32}`, so the check below is a second opinion, not the rule.
  username text not null unique check (length(username) between 3 and 32),

  -- `scrypt$<salt>$<hash>` — a different salt for every account.
  password_hash text not null,

  -- The one switch that has to work at the moment it is flipped: `sessionFor()`
  -- reads this on every request, so a ban takes effect on the next call.
  banned boolean not null default false,

  note text not null default '',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- ------------------------------------------------------------- sessions ----

create table if not exists public.auth_sessions (
  -- SHA-256 of the token, never the token. A dump of this table holds no working
  -- session.
  token_hash text primary key,
  user_id uuid not null references public.auth_users (id) on delete cascade,

  app_id text not null default '',
  device_id text not null default '',
  device_name text not null default '',

  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists auth_sessions_user_idx on public.auth_sessions (user_id);
create index if not exists auth_sessions_expires_idx on public.auth_sessions (expires_at);

-- --------------------------------------------------------- entitlements ----

create table if not exists public.auth_entitlements (
  user_id uuid not null references public.auth_users (id) on delete cascade,

  -- The product's id in the catalogue: `loader_apps.id`. It is resolved to the
  -- catalogue row's `keyauth_app_id` when `/v1/apps` answers, because that is the
  -- value the loader compares against.
  product_id text not null,

  app_id text not null default '',
  created_at timestamptz not null default now(),

  primary key (user_id, product_id)
);

create index if not exists auth_entitlements_user_idx on public.auth_entitlements (user_id);

-- ------------------------------------------------------------------ RLS ----
--
-- Enabled with no policy at all: the anon key can read nothing and write nothing.
-- Every read and write goes through the API, which holds the service role key on
-- the server and never hands it to a browser.

alter table public.auth_users enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.auth_entitlements enable row level security;

revoke all on public.auth_users from anon, authenticated;
revoke all on public.auth_sessions from anon, authenticated;
revoke all on public.auth_entitlements from anon, authenticated;
