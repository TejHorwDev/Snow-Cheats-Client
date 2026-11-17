-- SNOW CHEATS — licences and devices
--
-- The layer the example project called "KeyAuth": keys the owner mints, bound to a
-- product, redeemed by a customer, enforced against an expiry and a number of
-- devices. It sits beside `auth_*` because it is part of the sign-in service, and
-- it owns exactly two tables plus two columns on an existing one.
--
-- What is deliberately absent: resellers, sub-accounts, white-label tenants. One
-- owner mints every key. That was a decision made for this deployment, not an
-- oversight — an earlier attempt at reseller tiers was reverted.
--
-- Safe to run again: every object is created only if it is missing.

-- ------------------------------------------------------------- licences ----
--
-- A licence is a key that has been or can be redeemed. Once redeemed it is the
-- record of what that account owns and until when, which is why the entitlement
-- row below points back at it.

create table if not exists public.auth_licenses (
  id uuid primary key default gen_random_uuid(),

  -- `loader_apps.id` — the catalogue row the key unlocks.
  product_id text not null,

  -- SHA-256 of the normalised key. The plaintext exists once, in the mint
  -- response, and is never stored or readable again.
  code_hash text not null unique,

  -- `SNOW-…-7K2Q`: enough for the owner to recognise a key in a list, useless to
  -- anybody who reads the table.
  masked_code text not null,

  -- Days of access granted on redemption. Null means lifetime.
  days integer check (days is null or days between 1 and 36500),

  -- How many devices the account holding this licence may sign in from.
  device_limit integer not null default 1 check (device_limit between 1 and 100),

  note text not null default '',
  created_at timestamptz not null default now(),

  -- Expiry of the *key*, not of the access it grants: an unminted key that sits
  -- in a drawer for two years stops working. Null means it never expires.
  expires_at timestamptz,

  revoked_at timestamptz,
  redeemed_by uuid references public.auth_users (id) on delete set null,
  redeemed_at timestamptz
);

create index if not exists auth_licenses_product_idx on public.auth_licenses (product_id);
create index if not exists auth_licenses_redeemed_idx on public.auth_licenses (redeemed_by);

-- -------------------------------------------------------------- devices ----
--
-- One row per device a customer has signed in from. The loader has always sent a
-- `device_id` (64 hex characters, stored under %LOCALAPPDATA%\SNOWAuth\<app_id>\
-- and deliberately surviving an uninstall); this is the table that finally reads
-- it.

create table if not exists public.auth_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_users (id) on delete cascade,
  device_id text not null,
  device_name text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  unique (user_id, device_id)
);

create index if not exists auth_devices_user_idx on public.auth_devices (user_id);

-- ------------------------------------------- entitlements grow an expiry ----
--
-- A grant made by hand in the panel has no expiry. A grant made by redeeming a
-- licence does, and `/v1/apps` has to know the difference — otherwise a lapsed
-- licence would keep the card open forever.

alter table public.auth_entitlements add column if not exists expires_at timestamptz;
alter table public.auth_entitlements
  add column if not exists license_id uuid references public.auth_licenses (id) on delete set null;

-- ------------------------------------------------------------------ RLS ----
-- Enabled with no policy, exactly like the other auth tables: the anon key can
-- read nothing, and every read goes through the API holding the service role key.

alter table public.auth_licenses enable row level security;
alter table public.auth_devices enable row level security;

revoke all on public.auth_licenses from anon, authenticated;
revoke all on public.auth_devices from anon, authenticated;
