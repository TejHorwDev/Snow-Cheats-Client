import LoginForm from '@/components/LoginForm'
import ThemeToggle from '@/components/ThemeToggle'
import { adminReady } from '@/lib/env'

export const dynamic = 'force-dynamic'

/*
 * The door.
 *
 * Two rooms. The left one is the house: navy, a rule inside a rule, the wordmark, and
 * one sentence about what this panel is. The right one is the desk: paper, a short
 * welcome, two fields, one button. Nothing moves, nothing glows, and there is no
 * marketing — you are here because you already know what this is.
 */
export default function LoginPage(): React.JSX.Element {
  return (
    <main className="login-shell">
      <aside className="login-aside">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="wordmark">
            SNOW LOADER
            <em>Control panel</em>
          </span>
        </div>

        <div className="login-quote">
          <p className="login-kicker">Operator access</p>
          <p className="login-quote-title">Everything the loader serves, in one room.</p>
          <p>
            Products, artwork, accounts and the sign-in service — published here, read by the
            app on its next launch.
          </p>
        </div>

        <div className="login-aside-foot">
          <span>Authorised operators only</span>
          <span>SNOW · 2026</span>
        </div>
      </aside>

      <section className="login-main">
        <div className="login-tools">
          <ThemeToggle />
        </div>
        <div className="login">
          <p className="login-kicker">Sign in</p>
          <h1 className="login-title">Welcome back</h1>
          <p className="login-sub">
            Use the operator account for this deployment. Access is logged and rate-limited.
          </p>

          {adminReady() ? (
            <LoginForm />
          ) : (
            <div className="notice error">
              The panel is not configured. Set <code>ADMIN_USERNAME</code>,{' '}
              <code>ADMIN_PASSWORD</code> and <code>ADMIN_SESSION_SECRET</code> (32+
              characters) in the environment, then reload this page.
            </div>
          )}

          <p className="login-foot">Authorised operators only. Sessions last seven days.</p>
        </div>
      </section>
    </main>
  )
}
