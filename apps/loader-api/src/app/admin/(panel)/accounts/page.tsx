import Accounts from '@/components/Accounts'
import { databaseReady } from '@/lib/env'

export const dynamic = 'force-dynamic'

/*
 * Who can use the loader, and what each of them owns.
 *
 * A note on what this page is not: it is not a tenant switcher and it is not a
 * billing screen. One owner, a list of customers, and one checkbox per product.
 */
export default function AccountsPage(): React.JSX.Element {
  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">
            <span className="dot" data-tone={databaseReady() ? 'on' : 'off'} />
            Sign-in service
          </p>
          <h1>Accounts</h1>
          <p className="lede">
            The customers the loader lets in, and the products each one can open. This is the
            service the app talks to at <span className="mono">/v1/login</span>.
          </p>
        </div>
      </section>

      {databaseReady() ? (
        <Accounts />
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
