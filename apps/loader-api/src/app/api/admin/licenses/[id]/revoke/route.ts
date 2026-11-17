import { currentSession } from '@/lib/auth'
import { fail, ok, serverError } from '@/lib/http'
import { databaseReady } from '@/lib/env'
import { revokeLicence } from '@/lib/licenses'

export const dynamic = 'force-dynamic'

/*
 * POST /api/admin/licenses/:id/revoke
 *
 * Kills a key. Unredeemed, it can never be used; redeemed, the product leaves the
 * account on that customer's next call, because revoking also deletes the grant it
 * created — a revoke that left the entitlement behind would be a word, not a deed.
 */

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params): Promise<Response> {
  if (!(await currentSession())) return fail('Not signed in.', 401)
  if (!databaseReady()) return fail('Database is not configured.', 503)

  const { id } = await params

  try {
    await revokeLicence(id)
    return ok({ ok: true })
  } catch (error) {
    return serverError('[admin/licenses] revoke', error)
  }
}
