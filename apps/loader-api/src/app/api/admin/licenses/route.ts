import { currentSession } from '@/lib/auth'
import { listApps } from '@/lib/db'
import { body, fail, ok, serverError, text } from '@/lib/http'
import { databaseReady } from '@/lib/env'
import { MAX_MINT, listDevices, listLicences, mintLicences } from '@/lib/licenses'

export const dynamic = 'force-dynamic'

/*
 * GET  /api/admin/licenses — every key, every device, and the products to mint against.
 * POST /api/admin/licenses — mint keys against one product.
 *
 * The plaintext of a key exists once, in the POST response. Nothing else in this
 * panel — no list, no reload, no database console — can show it again, which is
 * why `returned` is the first thing the page puts on screen and the only thing it
 * never tries to fetch.
 *
 * There is no reseller tier here on purpose: one owner mints every key. An earlier
 * attempt at resellers was reverted and is not coming back.
 */

export async function GET(): Promise<Response> {
  if (!(await currentSession())) return fail('Not signed in.', 401)
  if (!databaseReady()) return fail('Database is not configured.', 503)

  try {
    const [licences, devices, apps] = await Promise.all([listLicences(), listDevices(), listApps()])
    return ok({
      licences,
      devices,
      products: apps.map((app) => ({ id: app.id, name: app.name }))
    })
  } catch (error) {
    return serverError('[admin/licenses]', error)
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!(await currentSession())) return fail('Not signed in.', 401)
  if (!databaseReady()) return fail('Database is not configured.', 503)

  const payload = await body(request)
  if (!payload) return fail('Nothing to mint.')

  const productId = text(payload['productId'], 64).trim()
  if (!productId) return fail('Choose a product.')

  const rawDays = payload['days']
  const days = rawDays === null || rawDays === '' || rawDays === undefined ? null : Number(rawDays)
  if (days !== null && (!Number.isFinite(days) || days < 1 || days > 36500)) {
    return fail('Days must be between 1 and 36500, or empty for lifetime.')
  }

  const deviceLimit = Number(payload['deviceLimit'] ?? 1)
  if (!Number.isFinite(deviceLimit) || deviceLimit < 1 || deviceLimit > 100) {
    return fail('Devices must be between 1 and 100.')
  }

  const count = Number(payload['count'] ?? 1)
  if (!Number.isFinite(count) || count < 1 || count > MAX_MINT) {
    return fail(`Mint between 1 and ${MAX_MINT} keys at a time.`)
  }

  try {
    const minted = await mintLicences({
      productId,
      days,
      deviceLimit: Math.floor(deviceLimit),
      count: Math.floor(count),
      note: text(payload['note'], 200)
    })
    return ok({ minted })
  } catch (error) {
    return serverError('[admin/licenses] POST', error)
  }
}
