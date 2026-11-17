import { currentSession } from '@/lib/auth'
import { db, listApps } from '@/lib/db'
import { hashPassword } from '@/lib/accounts'
import { body, fail, ok, serverError, text } from '@/lib/http'
import { databaseReady } from '@/lib/env'

export const dynamic = 'force-dynamic'

/*
 * PATCH  /api/admin/accounts/:id — password, ban, and what the account owns.
 * DELETE /api/admin/accounts/:id — remove the account and every session it holds.
 *
 * Granting a product is the interesting half. The loader decides whether a card
 * opens by comparing the catalogue row's `keyauth_app_id` against the ids this
 * account owns, so a product that has never been given one would be granted and
 * still look open — or, worse, be gated by a value nobody wrote down. A product
 * with no auth id therefore gets the catalogue's own uuid the moment it is granted,
 * and the grant is made with the same value.
 */

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  if (!(await currentSession())) return fail('Not signed in.', 401)
  if (!databaseReady()) return fail('Database is not configured.', 503)

  const { id } = await params
  const payload = await body(request)
  if (!payload) return fail('Nothing to change.')

  try {
    if ('password' in payload) {
      const password = text(payload['password'], 200)
      if (password.length < 8) return fail('Use a password of at least 8 characters.')
      const { error } = await db()
        .from('auth_users')
        .update({ password_hash: hashPassword(password) })
        .eq('id', id)
      if (error) throw new Error(error.message)

      /*
       * A new password ends every session on every device.
       *
       * The reason a password is reset is almost always that somebody else has the
       * old one, and leaving their session alive for seven more days would make the
       * reset a change of clothes rather than a lock.
       */
      await db().from('auth_sessions').delete().eq('user_id', id)
    }

    if ('banned' in payload) {
      const banned = payload['banned'] === true
      const { error } = await db().from('auth_users').update({ banned }).eq('id', id)
      if (error) throw new Error(error.message)
      if (banned) await db().from('auth_sessions').delete().eq('user_id', id)
    }

    if ('note' in payload) {
      const { error } = await db()
        .from('auth_users')
        .update({ note: text(payload['note'], 200) })
        .eq('id', id)
      if (error) throw new Error(error.message)
    }

    if ('productIds' in payload) {
      const wanted = Array.isArray(payload['productIds'])
        ? [...new Set(payload['productIds'].filter((value): value is string => typeof value === 'string'))]
        : []

      const catalogue = await listApps()
      const known = new Set(catalogue.map((row) => row.id))
      const productIds = wanted.filter((productId) => known.has(productId))

      // An auth id is assigned before anything is granted, so the grant is the
      // value the loader will actually compare.
      for (const productId of productIds) {
        const row = catalogue.find((entry) => entry.id === productId)
        if (!row || row.keyauth_app_id) continue
        await db().from('loader_apps').update({ keyauth_app_id: productId }).eq('id', productId)
      }

      const { error: clearError } = await db().from('auth_entitlements').delete().eq('user_id', id)
      if (clearError) throw new Error(clearError.message)

      if (productIds.length > 0) {
        const { error: insertError } = await db()
          .from('auth_entitlements')
          .insert(productIds.map((productId) => ({ user_id: id, product_id: productId })))
        if (insertError) throw new Error(insertError.message)
      }
    }

    return ok({ ok: true })
  } catch (error) {
    return serverError('admin/accounts:patch', error)
  }
}

export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  if (!(await currentSession())) return fail('Not signed in.', 401)
  if (!databaseReady()) return fail('Database is not configured.', 503)

  const { id } = await params

  try {
    // Sessions and entitlements cascade; the account is the only thing to delete.
    const { error } = await db().from('auth_users').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return ok({ ok: true })
  } catch (error) {
    return serverError('admin/accounts:delete', error)
  }
}
