import { sessionFor } from '@/lib/accounts'
import { db } from '@/lib/db'
import { databaseReady } from '@/lib/env'

export const dynamic = 'force-dynamic'

/*
 * GET /v1/apps
 *
 *   Authorization: Bearer <token>
 *     → 200 { username, apps: [{ id, product_id, name }] }
 *
 * `id` is the value the loader compares against the catalogue — the product's
 * `SNOW Auth app id`, which the panel assigns when a product is first granted. The
 * catalogue's own uuid travels beside it as `product_id` so the panel and this
 * answer cannot disagree about which product a row means.
 *
 * The loader reads this structurally and collects every id it finds, so an object
 * carrying both is read as both — which is what makes a product granted under
 * either value work.
 *
 * A failed lookup is a 503, never an empty 200: "you own nothing" and "I could not
 * ask" must not look the same to a paying customer.
 */
export async function GET(request: Request): Promise<Response> {
  if (!databaseReady()) {
    return Response.json({ detail: 'The sign-in service is not configured yet.' }, { status: 503 })
  }

  const session = await sessionFor(request)
  if (!session) {
    return Response.json({ detail: 'Not signed in.' }, { status: 401 })
  }

  try {
    const { data: granted, error: grantedError } = await db()
      .from('auth_entitlements')
      .select('product_id')
      .eq('user_id', session.userId)

    if (grantedError) throw new Error(grantedError.message)

    const productIds = (granted ?? []).map((row) => (row as { product_id: string }).product_id)

    if (productIds.length === 0) {
      return Response.json(
        { username: session.username, apps: [] },
        { headers: { 'cache-control': 'no-store' } }
      )
    }

    const { data: rows, error: rowsError } = await db()
      .from('loader_apps')
      .select('id,name,keyauth_app_id')
      .in('id', productIds)

    if (rowsError) throw new Error(rowsError.message)

    const apps = ((rows ?? []) as Array<{ id: string; name: string; keyauth_app_id: string }>).map(
      (row) => ({
        // The panel's own value wins; the uuid is the fallback for a product that
        // was granted before it was given an auth id.
        id: row.keyauth_app_id || row.id,
        product_id: row.id,
        name: row.name
      })
    )

    return Response.json(
      { username: session.username, apps },
      { headers: { 'cache-control': 'no-store' } }
    )
  } catch (error) {
    console.error('[v1/apps]', error instanceof Error ? error.message : error)
    return Response.json({ detail: 'Could not read what this account owns.' }, { status: 503 })
  }
}
