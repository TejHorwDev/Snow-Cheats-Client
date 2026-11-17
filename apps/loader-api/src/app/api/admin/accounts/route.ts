import { currentSession } from '@/lib/auth'
import { db, listApps } from '@/lib/db'
import { hashPassword, normaliseUsername } from '@/lib/accounts'
import { mintLicences, redeemLicence } from '@/lib/licenses'
import { body, fail, ok, serverError, text } from '@/lib/http'
import { databaseReady } from '@/lib/env'

export const dynamic = 'force-dynamic'

/*
 * GET  /api/admin/accounts  — every customer account, and what each one owns.
 * POST /api/admin/accounts  — create one.
 *
 * There is no sign-up anywhere in this product and there is not going to be: the
 * owner creates the account, tells the customer the password, and the customer
 * signs in on the loader. That is the whole of account management, and it is why
 * this lives in the panel rather than in a second admin tool.
 *
 * The password is hashed before it is stored and is never read back — not by this
 * route, not by the page, not by anybody with the database open.
 */

export interface AccountRow {
  id: string
  username: string
  banned: boolean
  note: string
  created_at: string
  last_login_at: string | null
  auth_entitlements: Array<{ product_id: string }>
}

export async function GET(): Promise<Response> {
  if (!(await currentSession())) return fail('Not signed in.', 401)
  if (!databaseReady()) return fail('Database is not configured.', 503)

  try {
    const { data, error } = await db()
      .from('auth_users')
      .select('id,username,banned,note,created_at,last_login_at,auth_entitlements(product_id)')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    const users = ((data ?? []) as unknown as AccountRow[]).map((user) => ({
      id: user.id,
      username: user.username,
      banned: user.banned,
      note: user.note ?? '',
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at,
      products: (user.auth_entitlements ?? []).map((row) => row.product_id)
    }))

    const products = (await listApps()).map((row) => ({
      id: row.id,
      name: row.name,
      keyauthAppId: row.keyauth_app_id
    }))

    return ok({ users, products })
  } catch (error) {
    return serverError('admin/accounts:list', error)
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!(await currentSession())) return fail('Not signed in.', 401)
  if (!databaseReady()) return fail('Database is not configured.', 503)

  const payload = await body(request)
  const username = normaliseUsername(payload?.['username'])
  const password = text(payload?.['password'], 200)

  if (!username) return fail('A username is 3–32 characters: letters, numbers, dot, dash, underscore.')
  if (password.length < 8) return fail('Use a password of at least 8 characters.')

  try {
    const { data, error } = await db()
      .from('auth_users')
      .insert({
        username,
        password_hash: hashPassword(password),
        note: text(payload?.['note'], 200)
      })
      .select('id')
      .single()

    if (error) {
      // Postgres' unique violation, said out loud rather than as a 500.
      if (error.code === '23505') return fail(`“${username}” already exists.`, 409)
      throw new Error(error.message)
    }

    const userId = (data as { id: string }).id

    /*
     * The one-step version of the workflow: create the account, and if a product
     * was chosen, mint a key for it and redeem it straight away.
     *
     * This is the same thing the example project's portal did — pick a product,
     * type a username and password, choose days and devices, done — except the key
     * falls out of it here as well, so the owner can hand over either the login or
     * the key. Without a product the account exists and owns nothing, which is a
     * legitimate state: every card stays locked until something is granted.
     */
    const productId = text(payload?.['productId'], 64).trim()
    if (!productId) return ok({ id: userId }, { status: 201 })

    const rawDays = payload?.['days']
    const days = rawDays === null || rawDays === '' || rawDays === undefined ? null : Number(rawDays)
    if (days !== null && (!Number.isFinite(days) || days < 1 || days > 36500)) {
      return fail('Days must be between 1 and 36500, or empty for lifetime.')
    }

    const deviceLimit = Number(payload?.['deviceLimit'] ?? 1)
    if (!Number.isFinite(deviceLimit) || deviceLimit < 1 || deviceLimit > 100) {
      return fail('Devices must be between 1 and 100.')
    }

    const [minted] = await mintLicences({
      productId,
      days,
      deviceLimit: Math.floor(deviceLimit),
      count: 1,
      note: `for ${username}`
    })

    const redeemed = await redeemLicence(minted.code, userId)
    if (!redeemed.ok) {
      return fail(redeemed.message ?? 'The account was created but its licence did not apply.', 409)
    }

    return ok(
      {
        id: userId,
        licence: {
          code: minted.code,
          days,
          deviceLimit: Math.floor(deviceLimit),
          expires: redeemed.expiresAt ?? null
        }
      },
      { status: 201 }
    )
  } catch (error) {
    return serverError('admin/accounts:create', error)
  }
}
