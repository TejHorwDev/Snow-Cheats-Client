import { db } from '@/lib/db'
import {
  appIdAccepted,
  clearAttempts,
  clientAddress,
  hashPassword,
  issueToken,
  normaliseUsername,
  tooManyAttempts,
  verifyPassword
} from '@/lib/accounts'
import { bindDevice } from '@/lib/licenses'
import { unreachable, upstreamAppId, upstreamCall, upstreamEnabled } from '@/lib/upstream'
import { databaseReady } from '@/lib/env'

export const dynamic = 'force-dynamic'

/*
 * POST /v1/login
 *
 *   { username, password, app_id, device_id, device_name }
 *     → 200 { token, username, expires }
 *     → non-2xx { detail: "<a sentence a person can read>" }
 *
 * Every failure answers with `detail`, because that string is what the sign-in
 * screen prints. "HTTP 401" is the fallback the app shows when the server says
 * nothing; a server that says something saves the person holding it.
 *
 * Sessions are seven days. The app never writes the token down, so a session is the
 * length of one sitting plus the restarts it survives in memory — seven days is the
 * ceiling, not the expectation.
 */

const SESSION_DAYS = 7

/**
 * A password nobody can have, verified when the username does not exist.
 *
 * Without it, an unknown username answers in microseconds and a real one takes as
 * long as scrypt does, which is a stopwatch that tells a stranger which accounts
 * exist.
 */
const DUMMY = hashPassword('this is not a password, and it is never checked against one')

function detail(message: string, status: number): Response {
  return Response.json({ detail: message }, { status, headers: { 'cache-control': 'no-store' } })
}

export async function POST(request: Request): Promise<Response> {
  /*
   * Delegated sign-in.
   *
   * When AUTH_UPSTREAM names a licensing service, the credentials the person typed
   * are checked there — that service's accounts, that service's device limits,
   * that service's product assignments — and its answer is returned unchanged. The
   * loader cannot tell the difference: it asked for a token and it gets one.
   *
   * Nothing is recorded here, deliberately. A copy of somebody else's session table
   * would be a second truth, and the first time the two disagreed it would be a
   * customer who could not sign in.
   */
  if (upstreamEnabled()) {
    const forwarded = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!forwarded) return detail('Enter username & password', 400)

    const answer = await upstreamCall('/v1/login', {
      method: 'POST',
      body: { ...forwarded, app_id: upstreamAppId(forwarded['app_id']) }
    })
    if (!answer) return unreachable()

    /*
     * The app id is compiled into the installer, so if the upstream's application
     * carries a different one, a perfectly good password comes back rejected — a
     * message about the password, caused by an id.
     *
     * One retry, with the id left out, separates the two: if the account is real and
     * only the id is wrong, the upstream signs them in, and what they may open is
     * still decided by /v1/apps, which lists their assignments. If the password was
     * wrong, the retry fails the same way and costs nothing.
     *
     * Not a loop, not a list of guesses: a single second attempt, and only after the
     * upstream has already said no.
     */
    if (answer.status >= 400 && answer.status < 500 && answer.status !== 429) {
      const withoutId = { ...forwarded }
      delete withoutId['app_id']
      const retry = await upstreamCall('/v1/login', { method: 'POST', body: withoutId })
      if (retry && retry.status < 300) return Response.json(retry.body ?? {}, {
        status: retry.status,
        headers: { 'cache-control': 'no-store' }
      })
    }
    return Response.json(answer.body ?? { detail: 'The sign-in service said nothing.' }, {
      status: answer.status,
      headers: { 'cache-control': 'no-store' }
    })
  }

  if (!databaseReady()) {
    return detail('The sign-in service is not configured yet.', 503)
  }

  let payload: Record<string, unknown>
  try {
    payload = (await request.json()) as Record<string, unknown>
  } catch {
    return detail('Enter username & password', 400)
  }

  const rawUsername = typeof payload['username'] === 'string' ? payload['username'].trim() : ''
  const password = typeof payload['password'] === 'string' ? payload['password'] : ''
  const appId = typeof payload['app_id'] === 'string' ? payload['app_id'].trim() : ''
  const deviceId = typeof payload['device_id'] === 'string' ? payload['device_id'].trim().slice(0, 128) : ''
  const deviceName = typeof payload['device_name'] === 'string' ? payload['device_name'].trim().slice(0, 80) : ''

  if (!rawUsername || !password) return detail('Enter username & password', 400)

  /*
   * A build's product id has to match the one this deployment serves. A mismatch
   * means an installer pointed at the wrong service, and saying so here is the
   * difference between a support message and an afternoon of guessing.
   */
  if (!appIdAccepted(appId)) {
    return detail('This build is not enabled for this sign-in service.', 403)
  }

  const username = normaliseUsername(rawUsername)
  if (!username) return detail('That username is not valid.', 400)

  const key = `${clientAddress(request)}|${username}`
  if (tooManyAttempts(key)) {
    return detail('Too many attempts. Try again in a few minutes.', 429)
  }

  try {
    const { data, error } = await db()
      .from('auth_users')
      .select('id,username,password_hash,banned')
      .eq('username', username)
      .maybeSingle()

    if (error) throw new Error(error.message)

    const user = data as { id: string; username: string; password_hash: string; banned: boolean } | null

    // Always hashed, whether or not there is a user: the stopwatch must not answer
    // the question the sentence below refuses to.
    const matches = verifyPassword(password, user?.password_hash ?? DUMMY)

    if (!user || !matches) return detail('Wrong username or password.', 401)
    if (user.banned) return detail('This account has been suspended.', 403)

    /*
     * The device the loader already sends. Before this existed the value arrived
     * and was ignored, which made a licence's device limit unenforceable: the same
     * key worked on a hundred machines and nobody could tell.
     *
     * A known device is stamped and let through; a new one has to fit in the
     * licence's slots. The refusal happens before a token is issued, so a machine
     * that is over the limit is never half-signed-in.
     */
    const binding = await bindDevice(user.id, deviceId, deviceName)
    if (!binding.ok) {
      return detail(binding.message ?? 'This account is already on too many devices.', 403)
    }

    const { token, hash } = issueToken()
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { error: insertError } = await db().from('auth_sessions').insert({
      token_hash: hash,
      user_id: user.id,
      app_id: appId,
      device_id: deviceId,
      device_name: deviceName,
      expires_at: expiresAt
    })
    if (insertError) throw new Error(insertError.message)

    // Housekeeping, not a requirement: an expired row is refused by `sessionFor`
    // anyway. This only stops the table growing for the life of the project.
    await db()
      .from('auth_sessions')
      .delete()
      .eq('user_id', user.id)
      .lt('expires_at', new Date().toISOString())
      .then(() => undefined, () => undefined)

    await db()
      .from('auth_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(() => undefined, () => undefined)

    clearAttempts(key)

    return Response.json(
      { token, username: user.username, expires: expiresAt },
      { headers: { 'cache-control': 'no-store' } }
    )
  } catch (error) {
    console.error('[v1/login]', error instanceof Error ? error.message : error)
    return detail('The sign-in service is having trouble. Try again in a moment.', 500)
  }
}
