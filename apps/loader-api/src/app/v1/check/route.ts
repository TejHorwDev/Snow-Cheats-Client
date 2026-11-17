import { sessionFor } from '@/lib/accounts'
import { db } from '@/lib/db'
import { grantLive } from '@/lib/licenses'
import { databaseReady } from '@/lib/env'

export const dynamic = 'force-dynamic'

/*
 * POST /v1/check            → is this session still entitled to anything?
 * POST /v1/check { app_id } → is it entitled to that product?
 *
 *   Authorization: Bearer <token>
 *     → 200 { ok: true,  username, app_id, expires }
 *     → 403 { ok: false, detail: "…" }
 *
 * The apps in the family call this instead of the loader's own sign-in: a game
 * integration asks "may this person keep running me?" on a timer, and needs an
 * answer that fits on one line. It is also the honest place to notice that a
 * licence lapsed five minutes ago.
 *
 * A 403 is the answer, not a 401: the session is fine, the entitlement is not.
 */

function deny(message: string): Response {
  return Response.json({ ok: false, detail: message }, { status: 403, headers: { 'cache-control': 'no-store' } })
}

export async function POST(request: Request): Promise<Response> {
  if (!databaseReady()) {
    return Response.json({ detail: 'The sign-in service is not configured yet.' }, { status: 503 })
  }

  const session = await sessionFor(request)
  if (!session) return Response.json({ detail: 'Not signed in.' }, { status: 401 })

  let payload: Record<string, unknown> = {}
  try {
    payload = (await request.json()) as Record<string, unknown>
  } catch {
    // No body is a valid question: "do I own anything at all?"
  }

  const appId = typeof payload['app_id'] === 'string' ? payload['app_id'].trim() : ''

  try {
    const { data, error } = await db()
      .from('auth_entitlements')
      .select('product_id,expires_at')
      .eq('user_id', session.userId)

    if (error) throw new Error(error.message)

    const live = ((data ?? []) as Array<{ product_id: string; expires_at: string | null }>).filter((row) =>
      grantLive(row.expires_at)
    )

    if (live.length === 0) return deny('This account has no active licence.')

    if (!appId) {
      const soonest = live
        .map((row) => row.expires_at)
        .filter((value): value is string => Boolean(value))
        .sort()[0]
      return Response.json(
        { ok: true, username: session.username, app_id: '', expires: soonest ?? null },
        { headers: { 'cache-control': 'no-store' } }
      )
    }

    /*
     * The id a caller uses is the product's `keyauth_app_id` when it has one, and
     * its uuid otherwise — the same rule `/v1/apps` applies — so a check and a card
     * cannot disagree about which product is meant.
     */
    const productIds = live.map((row) => row.product_id)
    const { data: apps, error: appsError } = await db()
      .from('loader_apps')
      .select('id,keyauth_app_id')
      .in('id', productIds)

    if (appsError) throw new Error(appsError.message)

    const match = ((apps ?? []) as Array<{ id: string; keyauth_app_id: string }>).find(
      (row) => (row.keyauth_app_id || row.id) === appId || row.id === appId
    )

    if (!match) return deny('That product is not on your account.')

    const grant = live.find((row) => row.product_id === match.id)
    return Response.json(
      { ok: true, username: session.username, app_id: appId, expires: grant?.expires_at ?? null },
      { headers: { 'cache-control': 'no-store' } }
    )
  } catch (error) {
    console.error('[v1/check]', error instanceof Error ? error.message : error)
    return Response.json({ detail: 'Could not read what this account owns.' }, { status: 503 })
  }
}
