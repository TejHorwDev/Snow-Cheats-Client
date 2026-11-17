# SNOW CHEATS — API, panel and sign-in service

The backend for the loader and the site. A web panel you open in a browser, the
public endpoints the desktop app reads, and the `/v1/*` sign-in service every
customer goes through.

```
apps/loader-api/
  supabase/loader.sql           catalogue tables + the loader-files bucket
  supabase/loader-card-frame.sql the per-card artwork dials
  supabase/auth.sql             accounts, sessions, entitlements
  src/app/v1/                   the sign-in service the loader talks to
  src/app/api/loader/           public: catalogue, config, update feed, installer
  src/app/api/admin/            the panel's API — every route session-guarded
  src/app/admin/                the panel itself, at /admin
  src/lib/storage.ts            R2 → B2 → Supabase → local, first configured wins
  scripts/dev-supabase.mjs      a local stand-in, for testing without a project
```

## Why it is shaped this way

**The panel is a website.** The desktop app contains no admin code and never talks
to an admin endpoint. A stolen installer gives nobody a catalogue to edit.

**Uploads never pass through the server.** The browser asks for a presigned URL and
PUTs the bytes straight to the bucket, so a large file costs the API a few kilobytes
of JSON. The one exception is the local driver, which exists for development.

**Hashes are computed where the bytes ended up.** After the upload the server
streams the stored object back, digests it, and writes the SHA-256 onto the product.
The loader then refuses to install a file whose bytes differ from that hash.

**RLS is on with no policy.** The anon key can read nothing and write nothing.
Every read goes through this server, which holds the service role key.

**The sign-in service lives here too.** One owner, one panel, one URL. The loader's
catalogue and its sign-in cannot drift apart, and a free Render instance is not asked
to keep two sleeping services awake.

## The database

Applied to the project `Snow Cheats Loader` (ref `pqomyuqirfygoccsmbid`), in this
order:

| File | Objects |
|---|---|
| `loader.sql` | `loader_apps`, `loader_config`, bucket `loader-files` |
| `loader-card-frame.sql` | `image_blur`, `image_dim` and their checks |
| `auth.sql` | `auth_users`, `auth_sessions`, `auth_entitlements` |

`loader_*` is the catalogue, `auth_*` is the sign-in service. One project, one bill,
one backup, and a prefix per service.

The bucket is **public with a 50 MB per-file ceiling** — the free plan's limit, and
the reason installers never live there. Artwork and film are served from the bucket's
own public URL so a card clip never wakes this service.

## The sign-in contract

```
POST /v1/login   { username, password, app_id, device_id, device_name }
                 → 200 { token, username, expires }
                 → non-2xx { detail: "<a sentence a person can read>" }

POST /v1/logout  Authorization: Bearer <token>            → 200
GET  /v1/apps    Authorization: Bearer <token>            → 200 { username, apps: [{ id, product_id, name }] }
```

- Passwords are scrypt with a per-account salt. Tokens are 32 random bytes; only
  their SHA-256 is stored, so a database dump contains no working session.
- Sessions last seven days, and expiry and ban are checked on **every** call — a ban
  takes effect immediately, not at the next sign-in.
- Eight attempts per ten minutes per address and username.
- `app_id` must match this deployment's `AUTH_APP_ID`. A mismatch is refused with a
  sentence, because an installer pointed at the wrong service is otherwise a mystery.
- `id` in `/v1/apps` is the catalogue row's `keyauth_app_id`, which the panel assigns
  automatically the first time a product is granted. The loader compares that value.

Accounts are created in the panel under **Accounts** — there is no sign-up.

## Environment

Copy `.env.example` and fill it in:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET=loader-files`
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` (32+ random characters)
- `AUTH_APP_ID` — the 24-character id compiled into the installer
- `PUBLIC_BASE_URL` — leave empty; media uses the bucket's public URL

Generate the session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Run it

```bash
npm install
npm run dev          # http://localhost:5280/admin
npm run lint         # tsc --noEmit
npm run sim          # the behavioural checks
npm run build && npm start
```

Deploys unchanged to Render (build `npm install && npm run build`, start
`npm start`), a container or a VPS. `render.yaml` in the repository root is the
Blueprint.

## Testing without Supabase

`scripts/dev-supabase.mjs` speaks the subset of PostgREST and Storage this code uses,
in memory:

```bash
node scripts/dev-supabase.mjs &          # http://127.0.0.1:54321
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=dev \
  ADMIN_USERNAME=admin ADMIN_PASSWORD=test-only-1 \
  ADMIN_SESSION_SECRET=$(openssl rand -hex 32) npm start
```

That is how the catalogue, the accounts and every `/v1` route are exercised end to
end without a project, an internet connection or a deployment.

## What the app expects

```
GET /api/loader/apps    → { apps: [{ id, name, description, version, image,
                                     artworkBlur, artworkDim, fileUrl,
                                     keyauthAppId, sha256, status }] }
GET /api/loader/config  → { website, video, notice, maintenance, filmBlur, filmDim }
GET /api/loader/update  → { update: { version, tag, file, sha256, size, url } | null }
GET /api/loader/installer[?probe=1]
```

The catalogue and config routes never return a 500: a database that is unreachable
answers with an empty catalogue, because the loader treats a failure and an empty
catalogue the same way and only one of them is loud.

## Keeping a free instance awake

`/api/health` answers `GET` and `HEAD` with a small JSON body and a 200, touching the
database on every call — which also stops a free Supabase project pausing for
inactivity. Point an uptime monitor at `https://<service>/api/health`; five-minute
intervals sit well inside Render's fifteen-minute idle window and fit the free
plan's 750 instance hours with little room to spare.
