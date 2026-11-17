# SNOW CHEATS

One repository, one owner, one deployment: the panel, the website and the Windows
loader, all built from here.

```
apps/
  loader-api/   Next.js panel + API + the sign-in service. Deployed on Render.
  site/         Next.js public website. Deployed on Vercel.
  loader/       Electron app for Windows. Built into a .exe by GitHub Actions.
```

Everything else in this file is how those three fit together and how to stand the
deployment up from nothing.

## What serves what

```
customer's PC ──┐
                ├─ apps/loader ──► /api/loader/apps      (catalogue)
                │                 /api/loader/config    (links, film, notice)
                │                 /api/loader/update    (self-update feed)
                │                 /v1/login, /v1/apps   (sign-in, entitlements)
                ▼
        apps/loader-api  ──►  Supabase (Postgres + Storage bucket `loader-files`)
                ▲
visitor's browser ─ apps/site  (reads the same public endpoints, revalidated every 10s)
```

The panel is the only place anything is published. A product added there appears on
the site within ten seconds and in the loader on its next launch — no deploy, no
cache to clear.

The sign-in service is **in this repository** (`apps/loader-api/src/app/v1/` and
`supabase/auth.sql`). It did not used to be: the loader talked to a separate
process that was not included anywhere. That is why a build of this project could
be published and still be unusable — nobody could sign in.

## The pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Panel | `/admin` on the API | Products, artwork, links, announcement, storage, accounts |
| Catalogue | `/api/loader/apps` | Public feed the loader and the site both read |
| Config | `/api/loader/config` | Published links, hero film, maintenance flag |
| Update feed | `/api/loader/update` | Newest `loader-v*` release, payload URL, hash |
| Installer | `/api/loader/installer` | 302 to the mirror, or a Range-aware pipe to GitHub |
| Sign-in | `/v1/login`, `/v1/logout`, `/v1/apps` | Accounts, sessions, entitlements |

## Standing it up from nothing

### 1. Supabase (database + files)

Create a project, then run these in the SQL editor, in this order:

1. `apps/loader-api/supabase/loader.sql` — catalogue tables and the `loader-files` bucket
2. `apps/loader-api/supabase/loader-card-frame.sql` — the per-card artwork dials
3. `apps/loader-api/supabase/auth.sql` — accounts, sessions, entitlements

All three are safe to run twice. The bucket is created **public, 50 MB per file**:
artwork and film are served from the bucket directly, and the free plan's ceiling
is 50 MB, so installers never live there — they go on GitHub Releases or a file
host and the panel holds the link.

From Project Settings → API you need the **Project URL** and the
**service_role key**. The service key is server-side only.

### 2. Render (panel, API and sign-in)

A Web Service from this repository:

```
root directory:  apps/loader-api
build command:   npm install && npm run build
start command:   npm start
health check:    /api/health
```

Environment:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key |
| `SUPABASE_BUCKET` | `loader-files` |
| `ADMIN_USERNAME` | your choice |
| `ADMIN_PASSWORD` | long and random — dashboard only, never in a chat |
| `ADMIN_SESSION_SECRET` | 32+ random characters |
| `AUTH_APP_ID` | the 24-character product id compiled into the installer |
| `PUBLIC_BASE_URL` | empty — media uses the bucket's public URL |

`render.yaml` in the repository root does all of this as a Blueprint; it marks the
secret values `sync: false` so Render asks for them once and stores them.

Free tier notes, honestly: the service sleeps after ~15 minutes idle and the first
request after that can take ~30 seconds. The loader's sign-in has a 20-second
timeout, so a cold login can fail once and work on the second attempt. That is a
plan limitation, not a bug.

### 3. Vercel (website)

A project from this repository, root directory `apps/site`, with:

| Variable | Value |
| --- | --- |
| `SNOW_API` | `https://<your-render-service>.onrender.com` |
| `SITE_URL` | `https://<your-domain-or-vercel-url>` |

No build settings to change: it is a stock Next.js app.

### 4. Fill it in from the panel

Sign in at `/admin`, then:

- **Settings** — website link, download link (your `.exe`, anywhere), hero film
- **Products** — name, description, links, one clip per card (video first; a still
  is only the fallback for a plain photo)
- **Accounts** — the customers who may sign in, and which products each one owns

A product with no sign-in id is open to every signed-in account. Granting a product
in **Accounts** assigns one the first time, which is what makes a grant mean
something.

### 5. The Windows installer

```bash
cd apps/loader
npm version patch --no-git-tag-version   # or set "version" by hand
git commit -am "loader: <version>"
git tag loader-v<version>
git push origin main --tags
```

The tag prefix matters: the app finds its own releases by `loader-v`, and the
workflow refuses a tag that disagrees with `package.json`.

`.github/workflows/loader-release.yml` builds on `windows-latest` with Node 22 and
publishes a GitHub Release containing:

- `SNOW-LOADER-Setup-<version>.exe` — the installer customers download
- `SNOW-LOADER-Payload-<version>.asar` — what an installed copy updates with
- `payload.json` — the version, file, size and SHA-256 the updater reads

The API address is compiled into the build. It comes from the repository variable
`SNOW_LOADER_API`, falling back to the value in the workflow file — so moving the
panel is a settings change plus a rebuild, not a source change. The same address
serves the catalogue *and* the sign-in service; there is only one.

Put the installer somewhere customers can reach (GitHub Releases is fine and free)
and paste that link into the panel's **Download** field.

### 6. The first release, in order

1. Supabase schema, as above.
2. Render, deployed and healthy at `/api/health`.
3. Vercel, with `SNOW_API` pointing at Render.
4. Panel: settings, one product, one account.
5. `apps/loader/package.json` at `1.0.1`, tag `loader-v1.0.1`, push.
6. Paste the installer link into the panel.
7. Download it on a clean Windows machine and sign in.

## Working on it

```bash
cd apps/loader-api && npm install && npm run dev     # panel on :5280
cd apps/site      && npm install && npm run dev     # site  on :5290
cd apps/loader    && npm install && npm run dev     # the window
```

Checks, all of which the release workflows run:

```bash
cd apps/loader-api && npm run lint && npm run sim && npm run build
cd apps/site      && npm run lint && npm run build
cd apps/loader    && npm run typecheck && npm run sim:update && npm run sim:access \
                  && npm run sim:config && npm run sim:download && npm run sim:ui \
                  && npm run sim:isolation
```

`apps/loader-api/scripts/dev-supabase.mjs` is a local stand-in for Supabase — the
subset of PostgREST and Storage this code uses, in memory — so the panel and the
sign-in service can be exercised without a project or an internet connection:

```bash
cd apps/loader-api
node scripts/dev-supabase.mjs &                       # :54321
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=dev \
  ADMIN_USERNAME=admin ADMIN_PASSWORD=test-only-1 ADMIN_SESSION_SECRET=$(openssl rand -hex 32) \
  npm start
```

## Product decisions that are not up for grabs

- **One deployment, one owner.** No tenants, no white-label, no reseller mode.
- **Video-first cards.** A clip is the default artwork; a still is the fallback for
  a plain photo upload.
- **No smooth scrolling, no `filter`/`backdrop-filter` on a playing video.** Artwork
  and film start instantly or they are not used.
- **Artwork and film never pass through the API.** They are served by the bucket's
  public URL, or by whatever host the link points at.
- **Free tiers.** If something cannot be done for free, the documentation says so
  instead of quietly upgrading a plan.

## Secrets

Nothing secret lives in this repository. Keys go into dashboards; `.env*` and
`deployment.local.md` are gitignored.
