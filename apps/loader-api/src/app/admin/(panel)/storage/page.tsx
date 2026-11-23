import StorageSettingsCard from '@/components/StorageSettings'
import { currentSession } from '@/lib/auth'
import { b2Endpoint, env, storageDriverConfigured } from '@/lib/env'
import { capFor, driver, formatBytes, usageByKind, type Kind } from '@/lib/storage'
import { ensureStorageConfig } from '@/lib/storage-config'

export const dynamic = 'force-dynamic'

/*
 * Storage.
 *
 * The question this page exists to answer, in the words it was asked: "my exes are
 * huge — if I upload from the panel, where does it go?" The answer is a driver, a
 * bucket, a real number of bytes, and the ceiling that applies to each kind of file.
 *
 * It is not decoration. The picker used to accept any file, spend ten minutes
 * uploading it, and then fail at the bucket's edge with a sentence about a payload
 * being too large. Whatever the ceiling is, it belongs on screen before the upload
 * starts — and so does the alternative when the file does not fit.
 */

const KIND_LABEL: Record<Kind, string> = {
  exe: 'Installers',
  image: 'Card images',
  video: 'Background film'
}

const DRIVER_NOTE: Record<string, string> = {
  supabase:
    'Supabase Storage. 50 MB per file by default, 1 GB of storage and 5 GB of egress a month on the free plan. Fine for images and the film; not a home for a 120 MB installer.',
  r2:
    'Cloudflare R2. No per-file ceiling worth naming, and egress is free — the right home for installers.',
  b2:
    'Backblaze B2. No per-file ceiling worth naming, and cheap egress — also right for installers.',
  local: 'Local disk. Development only: nothing here survives the container.'
}

export default async function StoragePage(): Promise<React.JSX.Element> {
  if (!(await currentSession())) return <p className="hint">Not signed in.</p>
  await ensureStorageConfig()

  const active = driver()
  const usage = await usageByKind()
  const kinds: Kind[] = ['exe', 'image', 'video']
  const total = 'error' in usage ? null : kinds.reduce((sum, kind) => sum + usage[kind].bytes, 0)
  const files = 'error' in usage ? null : kinds.reduce((sum, kind) => sum + usage[kind].count, 0)
  const biggest = total ? Math.max(...kinds.map((kind) => ('error' in usage ? 0 : usage[kind].bytes))) : 0

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="dot" data-tone="on" />
            Files
          </p>
          <h1>Storage</h1>
          <p className="lede">Where the installers live, how much of it is used, and the ceiling per file.</p>
        </div>

        <dl className="hero-facts">
          <div>
            <dt>Driver</dt>
            <dd>{active}</dd>
          </div>
          <div>
            <dt>Files</dt>
            <dd>{files ?? '—'}</dd>
          </div>
          <div>
            <dt>Used</dt>
            <dd>{total === null ? '—' : formatBytes(total)}</dd>
          </div>
        </dl>
      </section>

      <div className="usage-grid">
        {kinds.map((kind) => {
          const row = 'error' in usage ? null : usage[kind]
          const share = row && biggest ? Math.max(4, Math.round((row.bytes / biggest) * 100)) : 0
          return (
            <div className="panel" key={kind}>
              <p className="label" style={{ marginBottom: 8 }}>
                {KIND_LABEL[kind]}
              </p>
              <span className="usage-figure">{row ? formatBytes(row.bytes) : '—'}</span>
              <span className="hint">{row ? `${row.count} file${row.count === 1 ? '' : 's'} stored` : 'could not be listed'}</span>
              <span className="usage-bar" style={{ marginTop: 12 }}>
                <i style={{ width: `${share}%` }} />
              </span>
            </div>
          )
        })}
      </div>

      <div className="grid">
        <section className="panel span-7">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Where files go</h2>
              <p className="panel-sub">The driver, its credentials, and a real write to prove them.</p>
            </div>
          </div>
          <StorageSettingsCard />
        </section>

        <section className="panel span-5">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">{active === 'supabase' ? 'Supabase Storage' : active.toUpperCase()}</h2>
              <p className="panel-sub">The bucket in use right now.</p>
            </div>
            <span className="panel-action">{active}</span>
          </div>

          <p className="hint" style={{ marginBottom: 14 }}>
            {DRIVER_NOTE[active] ?? 'Unknown driver.'}
          </p>

          <dl className="kv">
            <dt>Driver</dt>
            <dd>
              <span className="mono">{active}</span>
            </dd>
            <dt>Bucket</dt>
            <dd>
              <span className="mono">
                {active === 'r2'
                  ? env.r2.bucket
                  : active === 'b2'
                    ? env.b2.bucket
                    : active === 'supabase'
                      ? env.supabaseBucket
                      : '.data/uploads'}
              </span>
            </dd>
            <dt>Stored</dt>
            <dd>
              <span className="mono">
                {total === null ? 'could not be listed' : `${formatBytes(total)} in ${files} file${files === 1 ? '' : 's'}`}
              </span>
            </dd>
            <dt>URLs</dt>
            <dd>
              <span className="mono">
                {env.publicBaseUrl ? `${env.publicBaseUrl}/<key>` : '/api/files/<key> (served by this service)'}
              </span>
            </dd>
          </dl>
        </section>

        <section className="panel span-12">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Ceiling per file</h2>
              <p className="panel-sub">Enforced before the upload starts, so a file that cannot fit fails in the first second.</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Largest accepted</th>
                <th>Stored</th>
              </tr>
            </thead>
            <tbody>
              {kinds.map((kind) => (
                <tr key={kind}>
                  <td>{KIND_LABEL[kind]}</td>
                  <td className="mono">{formatBytes(capFor(kind))}</td>
                  <td className="mono">
                    {'error' in usage ? '—' : `${usage[kind].count} · ${formatBytes(usage[kind].bytes)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Shown whatever the live driver is: the rule has to be in place *before*
            the variables are, or the first upload fails in the browser. */}
        <section className="panel span-6">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Backblaze B2 setup</h2>
              <p className="panel-sub">The CORS rule has to exist before the first upload.</p>
            </div>
          </div>
          <p className="hint">
            Endpoint in use: <span className="mono">{b2Endpoint()}</span> — derived from{' '}
            <span className="mono">B2_REGION</span> unless <span className="mono">B2_ENDPOINT</span> says
            otherwise.
          </p>
          <table>
            <tbody>
              <tr>
                <th>Bucket</th>
                <td className="mono">{env.b2.bucket || 'not set'}</td>
              </tr>
              <tr>
                <th>Key id</th>
                <td className="mono">{env.b2.keyId ? `${env.b2.keyId.slice(0, 10)}…` : 'not set'}</td>
              </tr>
              <tr>
                <th>Region</th>
                <td className="mono">{env.b2.region}</td>
              </tr>
            </tbody>
          </table>
          <p className="hint">
            The application key needs <span className="mono">readFiles</span>,{' '}
            <span className="mono">writeFiles</span> and <span className="mono">listFiles</span> on this
            bucket, and nothing else. Without <span className="mono">listFiles</span> the usage numbers
            above cannot be counted, and without <span className="mono">writeFiles</span> every upload is
            refused by B2 with a sentence about access.
          </p>
          <p className="hint">
            Uploads go from the browser straight to the bucket, so the bucket needs one CORS rule
            naming this panel. Backblaze → bucket → CORS Rules → add:
          </p>
          <pre className="mono hint">
            {`[
  {
    "corsRuleName": "snow-panel",
    "allowedOrigins": ["${env.publicBaseUrl || 'https://snow-loader-api.onrender.com'}"],
    "allowedOperations": ["s3_put", "s3_get", "s3_head"],
    "allowedHeaders": ["*"],
    "exposeHeaders": ["etag"],
    "maxAgeSeconds": 3600
  }
]`}
          </pre>
          <p className="hint">
            Without that rule the upload fails in the browser with a network error and no explanation —
            the bucket never sees the request.
          </p>
        </section>

        <section className="panel span-6">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Installers bigger than the ceiling</h2>
              <p className="panel-sub">They do not need to go through the panel at all.</p>
            </div>
          </div>
          <p className="hint">
            Every release already publishes <span className="mono">SNOW-LOADER-Setup-&lt;version&gt;.exe</span>{' '}
            on GitHub, and the loader updates itself from the small payload beside it — nobody installs
            the setup twice. The panel&apos;s Installer field is for builds that fit the bucket.
          </p>
          <p className="hint">
            To host large files here instead, add <span className="mono">R2_ACCOUNT_ID</span>,{' '}
            <span className="mono">R2_ACCESS_KEY_ID</span>, <span className="mono">R2_SECRET_ACCESS_KEY</span>{' '}
            and <span className="mono">R2_BUCKET</span> to this deployment. The driver order is R2, then
            B2, then Supabase, then local disk — the first one with credentials wins, and the ceiling
            follows it automatically.
          </p>
          {storageDriverConfigured() ? null : (
            <p className="hint">
              No storage credentials are set on this deployment, so uploads would land on local disk. Set{' '}
              <span className="mono">SUPABASE_URL</span> and{' '}
              <span className="mono">SUPABASE_SERVICE_ROLE_KEY</span>, or the R2 pair above.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
