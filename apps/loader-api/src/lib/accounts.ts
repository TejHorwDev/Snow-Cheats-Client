import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { db } from './db'
import { env } from './env'

/*
 * The sign-in service behind the loader.
 *
 * The desktop app signs in against `/v1/*` and the contract is small on purpose:
 * one call to get a token, one to drop it, one to ask what the account owns. Before
 * this existed in the repository, that service was somebody else's process on
 * somebody else's account, and nothing in the app could be used without it.
 *
 * It is served by this same Next deployment because that is the honest shape of the
 * thing: one owner, one panel, one URL. The loader's catalogue and its sign-in
 * therefore cannot drift apart, and a free Render instance is not asked to hold two
 * sleeping services awake.
 *
 * What is deliberately absent: e-mail, password resets, OAuth, tenants, roles. There
 * is one administrator who creates accounts in the panel and customers who sign in.
 * Anything more would be inventing a problem this product does not have.
 */

/** The one thing allowed to look like a username. Normalised in one place. */
export function normaliseUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const username = value.trim().toLowerCase()
  return /^[a-z0-9._-]{3,32}$/.test(username) ? username : null
}

/**
 * A password, hashed with scrypt and a salt of its own.
 *
 * `scrypt$<salt>$<hash>`, both base64. A per-password salt means two people who
 * chose the same sentence do not look the same in the table, and an operator reading
 * the database learns nothing from it.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false

  let expected: Buffer
  try {
    expected = Buffer.from(hash, 'base64')
  } catch {
    return false
  }
  if (expected.length !== 64) return false

  const actual = scryptSync(password, Buffer.from(salt, 'base64'), 64)
  return timingSafeEqual(actual, expected)
}

/**
 * A session token, and the hash that is what actually gets stored.
 *
 * The token is 32 random bytes and it is never written down here. A database dump
 * therefore contains no working session — the same reason a password is not stored
 * as a password.
 */
export function issueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: tokenHash(token) }
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** `Authorization: Bearer <token>`, or the second header the app also sends. */
export function bearerOf(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (match) return match[1].trim()
  const fallback = request.headers.get('x-session-token')
  return fallback && fallback.trim() ? fallback.trim() : null
}

export interface SignedIn {
  token: string
  userId: string
  username: string
  expiresAt: string
}

/**
 * Who this token belongs to, or nobody.
 *
 * Expiry and ban are checked on every call rather than trusted from login time: a
 * session issued before an account was banned must stop working immediately, and a
 * token that expired while the app sat open must not keep working because its
 * holder never closed it.
 */
export async function sessionFor(request: Request): Promise<SignedIn | null> {
  const token = bearerOf(request)
  if (!token) return null

  try {
    const { data, error } = await db()
      .from('auth_sessions')
      .select('token_hash,user_id,expires_at,auth_users(username,banned)')
      .eq('token_hash', tokenHash(token))
      .maybeSingle()

    if (error || !data) return null

    const row = data as unknown as {
      user_id: string
      expires_at: string
      auth_users: { username: string; banned: boolean } | { username: string; banned: boolean }[] | null
    }

    const owner = Array.isArray(row.auth_users) ? row.auth_users[0] : row.auth_users
    if (!owner || owner.banned) return null
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await db().from('auth_sessions').delete().eq('token_hash', tokenHash(token))
      return null
    }

    return { token, userId: row.user_id, username: owner.username, expiresAt: row.expires_at }
  } catch (error) {
    console.error('[auth] session lookup failed', error instanceof Error ? error.message : error)
    return null
  }
}

/* ------------------------------------------------------------- throttling --- */

/*
 * Eight attempts per ten minutes, per address and username.
 *
 * Not a security boundary — a proxy defeats it — but it turns a script that guesses
 * a thousand passwords a second into one that guesses eight per ten minutes, which
 * is the difference between an account and a countdown.
 */
const WINDOW_MS = 10 * 60 * 1000
const LIMIT = 8
const attempts = new Map<string, { count: number; resetAt: number }>()

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export function tooManyAttempts(key: string): boolean {
  const now = Date.now()
  const seen = attempts.get(key)

  if (!seen || now > seen.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }

  seen.count += 1
  return seen.count > LIMIT
}

export function clearAttempts(key: string): void {
  attempts.delete(key)
}

/** The app this deployment serves. Empty means "accept any build's id". */
export function appIdAccepted(appId: string): boolean {
  return !env.authAppId || appId === env.authAppId
}
