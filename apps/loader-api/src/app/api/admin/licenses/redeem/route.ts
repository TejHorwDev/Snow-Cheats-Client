import { currentSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { normaliseUsername } from '@/lib/accounts'
import { body, fail, ok, serverError, text } from '@/lib/http'
import { databaseReady } from '@/lib/env'
import { redeemLicence } from '@/lib/licenses'

export const dynamic = 'force-dynamic'

/*
 * POST /api/admin/licenses/redeem  { username, code }
 *
 * Redeems a key on a customer's behalf.
 *
 * The loader's sign-in screen asks for a username and password and nothing else —
 * it has no licence field, and adding one is a new installer rather than a route.
 * Until that exists, this is how a key sold on the website becomes access: the
 * owner types the customer's username and the key, and the product lands on that
 * account with the licence's expiry.
 *
 * It is the same `redeemLicence()` the apps' own self-registration uses, so a key
 * cannot be burned twice by using both doors.
 */

export async function POST(request: Request): Promise<Response> {
  if (!(await currentSession())) return fail('Not signed in.', 401)
  if (!databaseReady()) return fail('Database is not configured.', 503)

  const payload = await body(request)
  if (!payload) return fail('Send a username and a licence key.')

  const username = normaliseUsername(text(payload['username'], 40))
  if (!username) return fail('That username is not valid.')
  const code = text(payload['code'], 64).trim()
  if (!code) return fail('Enter the licence key.')

  try {
    const { data, error } = await db().from('auth_users').select('id').eq('username', username).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return fail('No account with that username.', 404)

    const redeemed = await redeemLicence(code, (data as { id: string }).id)
    if (!redeemed.ok) return fail(redeemed.message ?? 'That licence could not be redeemed.', 409)

    return ok({ ok: true, productId: redeemed.productId ?? '', expires: redeemed.expiresAt ?? null })
  } catch (error) {
    return serverError('[admin/licenses] redeem', error)
  }
}
