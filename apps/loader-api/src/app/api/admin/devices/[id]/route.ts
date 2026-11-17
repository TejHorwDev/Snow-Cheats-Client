import { currentSession } from '@/lib/auth'
import { fail, ok, serverError } from '@/lib/http'
import { databaseReady } from '@/lib/env'
import { removeDevice } from '@/lib/licenses'

export const dynamic = 'force-dynamic'

/*
 * DELETE /api/admin/devices/:id
 *
 * Frees one device slot. This is the support action behind the refusal a customer
 * sees when they sign in on a third machine with a two-device licence: the owner
 * removes the dead one and the new machine gets in on the next attempt.
 *
 * Deleting the device does not end its session — the session is a token with an
 * expiry, and ending it is a separate, deliberate act (`/api/admin/accounts/:id`).
 */

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  if (!(await currentSession())) return fail('Not signed in.', 401)
  if (!databaseReady()) return fail('Database is not configured.', 503)

  const { id } = await params

  try {
    await removeDevice(id)
    return ok({ ok: true })
  } catch (error) {
    return serverError('[admin/devices] delete', error)
  }
}
