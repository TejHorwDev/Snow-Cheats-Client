import { databaseReady } from '@/lib/env'
import { db } from '@/lib/db'
import { driver } from '@/lib/storage'
import { ensureStorageConfig } from '@/lib/storage-config'
import { upstreamBase } from '@/lib/upstream'

/*
 * GET  /api/health
 * HEAD /api/health
 *
 * For an uptime monitor, and for the only reason a health check exists: so that
 * something outside can tell whether this process is answering.
 *
 * It is deliberately cheap and deliberately always 200 while the process is alive.
 * An uptime monitor that goes red because Supabase had a hiccup for nine seconds
 * teaches you to ignore it, and an alert you ignore is worse than no alert. What the
 * checks found is reported in the body; `?deep=1` turns a failing database into a
 * 503 for the monitor that wants that instead.
 *
 * It also touches the database on every call, which is what stops a free Supabase
 * project from pausing for inactivity.
 */

export const dynamic = 'force-dynamic'

const started = Date.now()

interface Report {
  ok: boolean
  service: 'snow-loader-api'
  uptime: number
  checks: { database: 'up' | 'down' | 'not-configured'; storage: string }
  /*
   * Who checks a password, said out loud.
   *
   * "Wrong username or password" is the same sentence whether the account does not
   * exist, exists in the other system, or was created against a different app id —
   * and there is no way to tell those apart from the sign-in screen. This answers it
   * from outside, without a log or a shell: which mode is live, where it delegates
   * to, and which app id a build must be carrying to be let in.
   */
  auth: {
    mode: 'upstream' | 'local'
    upstream: string | null
    app_id: string
    /** The id actually sent upstream when it differs from the build's. */
    upstream_app_id: string | null
  }
  time: string
}

async function report(): Promise<Report> {
  await ensureStorageConfig()

  let database: Report['checks']['database'] = 'not-configured'

  if (databaseReady()) {
    try {
      // `head: true` means the rows never travel — this is a question, not a query.
      const { error } = await db().from('loader_apps').select('id', { head: true, count: 'exact' }).limit(1)
      database = error ? 'down' : 'up'
    } catch {
      database = 'down'
    }
  }

  return {
    ok: true,
    service: 'snow-loader-api',
    // Seconds. Enough to tell a restart from a long-running instance.
    uptime: Math.round((Date.now() - started) / 1000),
    checks: { database, storage: driver() },
    auth: {
      mode: upstreamBase() ? 'upstream' : 'local',
      upstream: upstreamBase(),
      app_id: (process.env['AUTH_APP_ID'] ?? '').trim(),
      upstream_app_id: (process.env['AUTH_UPSTREAM_APP_ID'] ?? '').trim() || null
    },
    time: new Date().toISOString()
  }
}

export async function GET(request: Request): Promise<Response> {
  const body = await report()
  const deep = new URL(request.url).searchParams.get('deep') === '1'
  const failed = deep && body.checks.database === 'down'

  return Response.json(
    { ...body, ok: !failed },
    { status: failed ? 503 : 200, headers: { 'cache-control': 'no-store' } }
  )
}

/** UptimeRobot and most monitors ask with HEAD first. */
export async function HEAD(): Promise<Response> {
  await report()
  return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } })
}
