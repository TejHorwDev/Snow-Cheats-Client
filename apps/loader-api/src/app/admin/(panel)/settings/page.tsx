import Appearance from '@/components/Appearance'
import Broadcast from '@/components/Broadcast'
import LinkConfig from '@/components/LinkConfig'
import { adminReady, databaseReady } from '@/lib/env'
import { driver } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/*
 * Settings.
 *
 * Three things that reach every installed copy without a release — the film, the
 * announcement and the maintenance switch — and the two links the outside world uses.
 * Then an honest statement of what this deployment is actually connected to, which is
 * not decoration: when something does not work, the first question is always which half
 * of the machine is missing.
 */
export default function SettingsPage(): React.JSX.Element {
  const storage = driver()

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="dot" data-tone="off" />
            Configuration
          </p>
          <h1>Settings</h1>
          <p className="lede">What the loader reads, and what this deployment is connected to.</p>
        </div>
      </section>

      <div className="grid">
        <section className="panel span-7">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Sign-in film</h2>
              <p className="panel-sub">Plays behind the sign-in form in every installed app.</p>
            </div>
            <span className="panel-action">Applies on next launch</span>
          </div>
          <Appearance />
        </section>

        <div className="span-5 stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Announcement &amp; maintenance</h2>
                <p className="panel-sub">Two switches that reach every copy without a release.</p>
              </div>
            </div>
            <Broadcast />
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Links</h2>
                <p className="panel-sub">Where the site and the loader send people.</p>
              </div>
            </div>
            <LinkConfig />
          </section>
        </div>

        <section className="panel span-12">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">This deployment</h2>
              <p className="panel-sub">Which halves of the machine are actually present.</p>
            </div>
          </div>

          <table>
            <tbody>
              <tr>
                <td>Database</td>
                <td>
                  <span className={`pill ${databaseReady() ? 'ok' : 'off'}`}>
                    {databaseReady() ? 'Supabase connected' : 'not configured'}
                  </span>
                </td>
              </tr>
              <tr>
                <td>Storage</td>
                <td>
                  <span className="pill ok">{storage}</span>{' '}
                  <span className="mono">
                    {storage === 'local'
                      ? '.data/uploads — development only'
                      : `${storage === 'r2' ? 'Cloudflare R2' : storage === 'b2' ? 'Backblaze B2' : 'Supabase Storage'}`}
                  </span>
                </td>
              </tr>
              <tr>
                <td>Admin</td>
                <td>
                  <span className={`pill ${adminReady() ? 'ok' : 'off'}`}>
                    {adminReady() ? 'configured' : 'missing credentials'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="panel span-12">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Buckets</h2>
              <p className="panel-sub">Uploads are presigned, so the bucket is the one that has to allow them.</p>
            </div>
          </div>
          <p className="hint" style={{ lineHeight: 1.8 }}>
            The browser writes straight to the bucket, so the bucket needs a CORS rule allowing{' '}
            <code>PUT</code> and <code>POST</code> from this origin, and <code>GET</code> if you
            set <code>PUBLIC_BASE_URL</code>. Without a public base the API serves the files
            itself, which works with a private bucket and needs no CORS at all.
          </p>
        </section>
      </div>
    </div>
  )
}
