# Deploying SNOW CHEATS

Five things, in order. Step 1 is done, step 2 is yours, the rest follows from it.

```
Supabase   database + files        ✅ done
Render     panel, API, sign-in     👉 you
Vercel     website                 (I create it, it goes live on merge)
GitHub     the Windows installer   (tag pushed, Actions builds it)
Panel      products + accounts     (last, once the API is awake)
```

Everything secret lives in `deployment.local.md` — open it in the file viewer and
copy from there. It is gitignored and it is not in this document on purpose.

---

## 1. Supabase — done

Project **Snow Cheats Loader**, ref `pqomyuqirfygoccsmbid`, Singapore.

| Object | What it is |
| --- | --- |
| `loader_apps` | the catalogue |
| `loader_config` | published links, hero film, notice |
| `auth_users` | the customers who may sign in |
| `auth_sessions` | live sessions (SHA-256 of the token, never the token) |
| `auth_entitlements` | which product each account owns |
| `loader-files` | public bucket, 50 MB per file |

If you ever rebuild this from scratch: SQL editor, run
`apps/loader-api/supabase/loader.sql`, then `loader-card-frame.sql`, then
`auth.sql`. They are safe to run twice.

---

## 2. Render — the panel, API and sign-in service

One service serves all three. It is a normal Next.js app; Render builds it and runs
`next start`.

### 2.1 Create the account and connect GitHub

1. Go to <https://render.com> and sign up with GitHub (free, no card).
2. **Dashboard → New + → Web Service**.
3. **Build and deploy from a Git repository** → connect GitHub → pick
   `Snow-Cheats-Client`.
   - If the repo is not in the list, click **Configure account** and give Render
     access to it.
4. Branch: `arena/18c9fa74-snow-cheats-client` until the pull request is merged,
   then `main`.

### 2.2 Name it exactly this

```
Name:            snow-loader-api
```

The name is not cosmetic: Render derives the address from it, and the address is
compiled into the Windows installer. **The expected address is**

```
https://snow-loader-api.onrender.com
```

If Render says the name is taken and gives you something else (for example
`snow-loader-api-xyz.onrender.com`), stop and tell me — the installer has to be
rebuilt with the real address. Nothing else about the deployment changes.

### 2.3 Settings

| Field | Value |
| --- | --- |
| Language / Runtime | Node |
| Region | Singapore (closest to you) |
| Root Directory | `apps/loader-api` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Instance Type | **Free** |
| Health Check Path | `/api/health` |

Root Directory is the one people get wrong. Render's repository root is the
monorepo, and without `apps/loader-api` it tries to build the whole thing.

### 2.4 Environment variables

**Add Environment Variable**, one at a time. Values are in `deployment.local.md`:

| Key | Value |
| --- | --- |
| `SUPABASE_URL` | `https://pqomyuqirfygoccsmbid.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the long `eyJ…` key — **secret** |
| `SUPABASE_BUCKET` | `loader-files` |
| `ADMIN_USERNAME` | `snow` |
| `ADMIN_PASSWORD` | the password in the file — **secret** |
| `ADMIN_SESSION_SECRET` | the 48-character string — **secret** |
| `AUTH_APP_ID` | `7cceaf553a603ceb8d54a6c2` |
| `PUBLIC_BASE_URL` | *(leave empty)* |
| `NODE_VERSION` | `22` |

Two things to be careful about:

- Paste the **service_role** key, not the `anon` one. The anon key cannot read the
  tables (RLS is on with no policy) and the panel will look broken.
- Do not put a trailing slash on `SUPABASE_URL`.

### 2.5 Deploy

**Create Web Service**. The first build takes about three minutes. Watch the log:
it should end with `Ready in …ms`.

Then open:

```
https://snow-loader-api.onrender.com/api/health
```

Expect, exactly:

```json
{"ok":true,"service":"snow-loader-api","checks":{"database":"up","storage":"supabase"}}
```

- `database: "up"` → Supabase is wired correctly.
- `database: "down"` → the URL or the service_role key is wrong.
- The page takes 30 seconds to answer → normal on the free tier if it has been
  idle; it wakes and stays warm for ~15 minutes.

### 2.6 Sign in to the panel

```
https://snow-loader-api.onrender.com/admin
```

Username `snow`, the password from `deployment.local.md`. A wrong password is
refused with a sentence — that is the check working.

If you forget the password, change `ADMIN_PASSWORD` in Render's environment and
redeploy; nothing is stored, it is read at boot.

---

## 3. Vercel — the website

**One thing is missing that only you can click.** Vercel has no GitHub login
connection on this account yet, so it refuses to import the repository:

> Failed to link TejHorwDev/Snow-Cheats-Client. You need to add a Login
> Connection to your GitHub account first.

Fix it once, in either place:

- **Vercel → Account Settings → Authentication → Login Connections → GitHub →
  Connect**, then approve; or
- **GitHub → Settings → Applications → Vercel → Configure →** give it access to
  `Snow-Cheats-Client`.

Then: **Add New → Project → Import** `Snow-Cheats-Client`, and set

| Field | Value |
| --- | --- |
| Root Directory | `apps/site` |
| Framework | Next.js (detected) |
| `SNOW_API` | `https://snow-loader-api.onrender.com` |
| `SITE_URL` | `https://<project>.vercel.app` |

No build command to change. Every push to `main` redeploys.

⚠️ Vercel builds the **default branch**, which is `main` — and the new code is on
the pull request `#1`, not on `main` yet. Merge the pull request and the site goes
live with everything above; importing before that publishes the previous owner's
site.

The site reads the panel and revalidates every ten seconds: a product published in
the panel appears on the site without a deploy.

The site reads the panel and revalidates every ten seconds: a product published in
the panel appears on the site without a deploy. If the site shows nothing, the
panel answered with nothing — check `/api/loader/apps` on the Render address
directly.

---

## 4. The Windows installer

**Built and published** by `.github/workflows/loader-release.yml`, a tag push
starting it — currently `loader-v1.0.2`:
<https://github.com/TejHorwDev/Snow-Cheats-Client/releases/tag/loader-v1.0.2>

| Asset | What it is |
| --- | --- |
| `SNOW-LOADER-Installer-<version>.exe` | **the one customers download** — the custom installer window |
| `SNOW-LOADER-Setup-<version>.exe` | the plain NSIS installer the window runs, for a machine where the window itself will not start |
| `SNOW-LOADER-<version>-x64.zip` | the app unzipped, for a machine that refuses both |
| `SNOW-LOADER-Payload-<version>.asar` | what an installed copy updates with |
| `payload.json` | version, file, size, SHA-256 for the updater |

The installer link, if you want to paste it into **Settings → Download**:

```
https://github.com/TejHorwDev/Snow-Cheats-Client/releases/download/loader-v1.0.2/SNOW-LOADER-Installer-1.0.2.exe
```

### Why there are three ways to install

The stock NSIS wizard draws its first page from language strings resolved at
runtime. On some Windows machines those resolve to empty strings and the whole
wizard renders blank — empty radio labels, empty Next and Cancel buttons, no way
forward. It happened on this project's own test machine at 1.0.0 and again at
1.0.1 after the page itself was removed.

So the installer people see is no longer NSIS. `apps/loader/installer/` is a
small Electron window with its own UI: it asks for a folder, then runs the real
NSIS installer **silently** (`/S /currentuser /D=<folder>`) and watches the
target folder grow so the progress bar is honest. Nothing is reimplemented —
shortcuts, the uninstall entry and the update payload are all still NSIS's work.

| Situation | Use |
| --- | --- |
| Normal | `SNOW-LOADER-Installer-<version>.exe` |
| The window will not open | `SNOW-LOADER-Setup-<version>.exe /S` (silent, per-user) |
| Neither works | unzip `SNOW-LOADER-<version>-x64.zip`, run `SNOW LOADER.exe` |

The same machine that showed the blank wizard is the reason this exists; the
installer window cannot render blank, because its text is HTML.

Left empty, **Settings → Download** makes the panel pipe the newest release
itself — always current, but on the free tier the first byte can take half a
minute if the instance is asleep.

Pasting it makes every Download button on the site go straight to the file. Left
empty, the panel pipes the newest release itself — always current, but on the free
tier the first byte can take half a minute if the instance is asleep.

### The address inside the .exe

The app has no environment to read, so the API address is compiled in at build
time (`SNOW_LOADER_API`, defaulting to `https://snow-loader-api.onrender.com`).
That is why the Render service is named for its address, and why moving the panel
later means a new release rather than a settings change.

### Later releases

```bash
cd apps/loader
npm version patch --no-git-tag-version   # 1.0.2 -> 1.0.3
git commit -am "loader: 1.0.3"
git tag loader-v1.0.3
git push origin main --tags
```

The tag prefix `loader-v` is required — the app finds its own updates by it, and the
workflow refuses a tag that disagrees with `package.json`.

Installed copies update themselves from the `.asar` payload: a few MB, hash
verified, applied on the next start. Nobody reinstalls.

---

## 4b. Licence keys and devices

The loader signs in with a username and password. Behind that, in this deployment's
own database, sit licence keys with an expiry and a device limit — the part the
previous owner ran in a separate auth service.

**Where it lives:** `/admin/licenses` on the panel. It is not in the nav (the menu
matches the project this one derives from); bookmark it.

### The flow

1. **Mint** — pick a product, days (empty = lifetime), devices per key, how many.
   The plaintext keys appear **once**, in the response. Copy them then; only a hash
   and the last four characters are stored.
2. **Sell** the key.
3. **Redeem** — for the loader, in the panel: *Redeem a key for a customer*, type
   the username and the key. The product lands on that account for the licence's
   days. (Apps that call `/v1/register` themselves redeem it with the same key and
   the same rule: a key works once, at one door.)
4. **Devices** — every machine that signs in is recorded. A key with 2 devices
   refuses the third with a sentence the customer can act on; the owner deletes the
   dead machine in the panel and the next attempt gets in.

### What is enforced where

| Rule | Where |
| --- | --- |
| key exists, not revoked, not already used, not expired | `redeemLicence()` |
| days → expiry on the grant | `redeemLicence()` |
| lapsed grant stops opening the card | `/v1/apps` filters by `grantLive()` |
| device limit | `/v1/login` binds the device before a token is issued |
| revoking takes the product away | `revokeLicence()` deletes the grant |

### What it is not

No resellers, no sub-accounts, no white-label tenants. One owner mints every key.
An earlier attempt at reseller tiers was reverted and is not coming back.

### The gap, stated plainly

The loader's sign-in screen has **no licence field** — it asks for a username and
password and nothing else, exactly as the project this one derives from did.
So keys are redeemed by the owner in the panel, or by an app that speaks
`/v1/register`. Putting a key field on the loader's own sign-in is a loader change
plus a new installer, and has not been done.

---

## 4c. Signing in against your own auth service

The loader can take its credentials from an external licensing service instead of
this deployment's own tables — the setup where users are created in that service and
just type the same username and password into the loader.

**Switch it on:** Render → your service → **Environment** →

```
AUTH_UPSTREAM=https://indra-auth.onrender.com
```

Save. Render restarts, nothing else changes, and **no new installer is needed** —
the loader still talks to `snow-loader-api.onrender.com`, which now forwards.

### What is forwarded

| Loader calls | This deployment does | The upstream does |
| --- | --- | --- |
| `POST /v1/login` | passes the credentials on | checks them, applies device limits, returns its token |
| `GET /v1/apps` | passes the caller's `Bearer` token on | answers with that account's products |
| `POST /v1/check` | forwards | decides |
| `POST /v1/register` | forwards | redeems the key |
| `POST /v1/logout` | forwards, then answers `{"ok":true}` | ends the session |

Nothing is cached and no copy of the upstream's sessions is written here: two
tables that both claim to know who is signed in is how a customer ends up unable to
sign in. The token the loader holds **is** the upstream's token.

An unreachable upstream answers `503` with *"The sign-in service is having trouble.
Try again in a moment."* — never "wrong password", which would send people to reset
credentials that were fine.

### What changes when it is on

- **Accounts are created upstream, not in this panel.** `/admin/accounts`,
  `/admin/licenses` and the licence keys stop being the authority: the panel still
  owns the catalogue (cards, files, download links), the upstream owns access.
- **The ids must agree.** The loader unlocks a card when the id from `/v1/apps`
  matches the card's **SNOW Auth app id** in the panel. So each product in the
  upstream service must carry the same id as the catalogue row it should unlock
  (or the panel's field must be set to that product's id upstream).
- Delete `AUTH_UPSTREAM` to go back to the panel's own accounts. Nothing else has
  to change, and the two systems do not collide: one is used at a time.

### Before you rely on it

That host is a **Render service somebody else deployed**. If you do not control its
Render account, you have moved the thing your customers cannot do without — signing
in — onto a server and an account you do not own. Own it, or host your own copy,
before you sell anything against it.

---

## 5. Fill it in from the panel

1. **Settings** → website link, download link (the release URL above), hero film.
2. **Products** → add one: name, description, a clip per card. Any https link works
   for the artwork; uploads go to the bucket.
3. **Accounts** → create the first customer, tick the products they own.
4. Install the .exe on a clean Windows machine and sign in as that customer.

### Common snags

| Symptom | Cause |
| --- | --- |
| `Wrong username or password` for a customer who exists | they were created in the panel but the panel is pointed at a different database — check `/api/health` |
| A product shows as locked | the account does not own it: tick it in **Accounts**. A product with no sign-in id is open to everyone |
| First sign-in fails, second works | the free Render instance was asleep; the app has a 20-second login timeout |
| Site shows no products | the panel's catalogue is empty, or `SNOW_API` in Vercel is wrong |
| Installer downloads but sign-in says "Connection failed" | the .exe was built with the wrong address — the Render URL and the compiled one must match |
