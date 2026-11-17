import Licences from '@/components/Licences'
import { databaseReady } from '@/lib/env'

export const dynamic = 'force-dynamic'

/*
 * Licence keys — the page that replaces what the example project kept in a
 * separate auth service's own dashboard.
 *
 * Not in the nav, by request: the menu is the one the project it derives from has,
 * and this is reached by its address. Bookmark /admin/licenses.
 */
export default function LicencesPage(): React.JSX.Element {
  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">
            <span className="dot" data-tone={databaseReady() ? 'on' : 'off'} />
            Sign-in service
          </p>
          <h1>Licence keys</h1>
          <p className="lede">
            Keys the loader accepts, the days each one grants, and the machines they have been used
            from. A customer redeems a key once; after that the account owns the product until the
            days run out.
          </p>
        </div>
      </section>

      {databaseReady() ? (
        <Licences />
      ) : (
        <div className="card">
          <h2>The database is not configured</h2>
          <p className="hint">
            Set <span className="mono">SUPABASE_URL</span> and{' '}
            <span className="mono">SUPABASE_SERVICE_ROLE_KEY</span>, then reload this page.
          </p>
        </div>
      )}
    </div>
  )
}
