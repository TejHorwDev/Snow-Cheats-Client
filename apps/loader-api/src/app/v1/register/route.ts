import { db } from '@/lib/db'
import { appIdAccepted, clearAttempts, clientAddress, hashPassword, normaliseUsername, tooManyAttempts } from '@/lib/accounts'
import { codeDigest, redeemLicence } from '@/lib/licenses'
import { upstreamCall, upstreamEnabled, unreachable } from '@/lib/upstream'
import { databaseReady } from '@/lib/env'

export const dynamic = 'force-dynamic'

/*
 * POST /v1/register
 *
 *   { username, password, app_id, license }
 *     → 200 { ok: true, username, product_id, expires }
 *     → non-2xx { detail: "<a sentence a person can read>" }
 *
 * Self-registration from a licence key: the customer buys a key, the app turns it
 * into an account. The loader's sign-in screen does not call this — it asks for a
 * username and password and says licences are sold on the website — but the other
 * apps in the family do, and the example project's contract has it, so the service
 * has it too.
 *
 * The account exists only if the key redeems. Nothing is created first and cleaned
 * up afterwards: a failed redemption must not leave a username taken.
 */

function detail(message: string, status: number): Response {
  return Response.json({ detail: message }, { status, headers: { 'cache-control': 'no-store' } })
}

export async function POST(request: Request): Promise<Response> {
  if (upstreamEnabled()) {
    const forwarded = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!forwarded) return detail('Send username, password and a licence key.', 400)
    const answer = await upstreamCall('/v1/register', { method: 'POST', body: forwarded })
    if (!answer) return unreachable()
    return Response.json(answer.body ?? {}, {
      status: answer.status,
      headers: { 'cache-control': 'no-store' }
    })
  }

  if (!databaseReady()) return detail('The sign-in service is not configured yet.', 503)

  let payload: Record<string, unknown>
  try {
    payload = (await request.json()) as Record<string, unknown>
  } catch {
    return detail('Send username, password and a licence key.', 400)
  }

  const rawUsername = typeof payload['username'] === 'string' ? payload['username'].trim() : ''
  const password = typeof payload['password'] === 'string' ? payload['password'] : ''
  const appId = typeof payload['app_id'] === 'string' ? payload['app_id'].trim() : ''
  const license = typeof payload['license'] === 'string' ? payload['license'] : ''

  if (!appIdAccepted(appId)) return detail('This build is not enabled for this sign-in service.', 403)

  const username = normaliseUsername(rawUsername)
  if (!username) return detail('Use 3–32 characters: letters, numbers, dot, dash or underscore.', 400)
  if (password.length < 8) return detail('Use a password of at least 8 characters.', 400)
  if (!license.trim()) return detail('Enter your licence key.', 400)

  const key = `${clientAddress(request)}|register|${username}`
  if (tooManyAttempts(key)) return detail('Too many attempts. Try again in a few minutes.', 429)

  try {
    const { data: existing, error: existingError } = await db()
      .from('auth_users')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (existingError) throw new Error(existingError.message)
    if (existing) return detail('That username is taken.', 409)

    /*
     * The key is checked before the account is written, and written against the
     * product the key names — not against whatever the caller said. A key for one
     * product must never unlock another.
     */
    const { data: probe, error: probeError } = await db()
      .from('auth_licenses')
      .select('id')
      .eq('code_hash', codeDigest(license))
      .maybeSingle()

    if (probeError) throw new Error(probeError.message)
    if (!probe) return detail('That licence key does not exist.', 404)

    const { data: created, error: createError } = await db()
      .from('auth_users')
      .insert({ username, password_hash: hashPassword(password) })
      .select('id')
      .single()

    if (createError) throw new Error(createError.message)
    const userId = (created as { id: string }).id

    const redeemed = await redeemLicence(license, userId)
    if (!redeemed.ok) {
      // The key lost a race with somebody else, or was revoked a moment ago.
      await db().from('auth_users').delete().eq('id', userId)
      return detail(redeemed.message ?? 'That licence could not be redeemed.', 409)
    }

    clearAttempts(key)

    return Response.json(
      {
        ok: true,
        username,
        product_id: redeemed.productId ?? '',
        expires: redeemed.expiresAt ?? null
      },
      { headers: { 'cache-control': 'no-store' } }
    )
  } catch (error) {
    console.error('[v1/register]', error instanceof Error ? error.message : error)
    return detail('The sign-in service is having trouble. Try again in a moment.', 500)
  }
}
