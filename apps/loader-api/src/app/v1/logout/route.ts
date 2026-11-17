import { bearerOf, tokenHash } from '@/lib/accounts'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/*
 * POST /v1/logout
 *
 *   Authorization: Bearer <token> → 200
 *
 * Always 200. The app drops its token whatever this answers, and a logout that
 * fails because the row was already gone is a logout that makes the person press
 * the button twice.
 */
export async function POST(request: Request): Promise<Response> {
  const token = bearerOf(request)

  if (token) {
    try {
      await db().from('auth_sessions').delete().eq('token_hash', tokenHash(token))
    } catch (error) {
      console.error('[v1/logout]', error instanceof Error ? error.message : error)
    }
  }

  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
}
