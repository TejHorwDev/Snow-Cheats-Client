import { createHash, randomInt } from 'node:crypto'
import { db } from './db'

/*
 * Licences and devices — the layer the example project called "KeyAuth".
 *
 * A licence is a key the owner mints against a product. Redeeming it creates the
 * entitlement the loader reads, with an expiry; signing in binds a device, up to
 * the number the licence allows. Everything here is the server side of that, and
 * the pure decisions live in exported functions so a simulator can check them
 * without a database.
 *
 * Kept in this repository, in this database, under this owner. It talks to no
 * external licensing service, holds no seller key, and knows nothing about
 * resellers.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const GROUPS = 3
const GROUP_LENGTH = 4
export const MAX_MINT = 50

/** Uppercase, letters and digits only. `snow-7k2q` and `SNOW 7 K 2 Q` agree. */
export function normaliseCode(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function codeDigest(value: unknown): string {
  return createHash('sha256').update(normaliseCode(value)).digest('hex')
}

function randomGroup(): string {
  let out = ''
  for (let index = 0; index < GROUP_LENGTH; index += 1) {
    out += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return out
}

/** `SNOW-7K2Q-9XMP-4TBH` — the plaintext, produced once and never stored. */
export function generateCode(): string {
  return `SNOW-${Array.from({ length: GROUPS }, randomGroup).join('-')}`
}

/** `SNOW-…-4TBH` — what the panel may show of a key that has been minted. */
export function maskCode(value: unknown): string {
  const raw = normaliseCode(value)
  return `SNOW-…-${raw.slice(-4)}`
}

/**
 * What a sign-in from this device may do.
 *
 * `known`  — this device has signed in before; always allowed, whatever the limit.
 * `free`   — a new device, and the account has room for it.
 * `full`   — a new device, and the account is at its limit.
 *
 * A null limit (no licence on the account, e.g. a product granted by hand) means
 * unlimited devices, which is the behaviour every account had before licences
 * existed.
 */
export function deviceSlot(limit: number | null, known: boolean, used: number): 'known' | 'free' | 'full' {
  if (known) return 'known'
  if (limit === null) return 'free'
  return used < limit ? 'free' : 'full'
}

/** Whether a grant is still live. Null expiry means it never lapses. */
export function grantLive(expiresAt: string | null, now = Date.now()): boolean {
  if (!expiresAt) return true
  const at = new Date(expiresAt).getTime()
  return Number.isFinite(at) ? at > now : true
}

/* ---------------------------------------------------------------- rows ---- */

export interface LicenceRow {
  id: string
  productId: string
  productName: string
  maskedCode: string
  days: number | null
  deviceLimit: number
  note: string
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  redeemedBy: string | null
  redeemedAt: string | null
}

export interface MintInput {
  productId: string
  days: number | null
  deviceLimit: number
  count: number
  note: string
}

export interface MintedLicence {
  id: string
  code: string
  maskedCode: string
  productId: string
  days: number | null
  deviceLimit: number
}

interface StoredLicence {
  id: string
  product_id: string
  masked_code: string
  days: number | null
  device_limit: number
  note: string
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  redeemed_by: string | null
  redeemed_at: string | null
}

/* --------------------------------------------------------------- minting -- */

export async function mintLicences(input: MintInput): Promise<MintedLicence[]> {
  const codes = Array.from({ length: input.count }, generateCode)
  const rows = codes.map((code) => ({
    product_id: input.productId,
    code_hash: codeDigest(code),
    masked_code: maskCode(code),
    days: input.days,
    device_limit: input.deviceLimit,
    note: input.note
  }))

  const { data, error } = await db().from('auth_licenses').insert(rows).select('id,masked_code,product_id')
  if (error) throw new Error(error.message)

  const inserted = (data ?? []) as Array<{ id: string; masked_code: string; product_id: string }>
  /*
   * The plaintext is paired with its row by masked code, because that is the only
   * value the insert echoes back. Two keys in one batch can share their last four
   * characters, so each masked value is consumed once and the pairing falls back to
   * order — the code matters, the pairing does not.
   */
  return codes.map((code, index) => {
    const row = inserted[index] ?? { id: '', masked_code: maskCode(code), product_id: input.productId }
    return {
      id: row.id,
      code,
      maskedCode: row.masked_code,
      productId: row.product_id,
      days: input.days,
      deviceLimit: input.deviceLimit
    }
  })
}

export async function listLicences(): Promise<LicenceRow[]> {
  const { data, error } = await db()
    .from('auth_licenses')
    .select('id,product_id,masked_code,days,device_limit,note,created_at,expires_at,revoked_at,redeemed_by,redeemed_at')
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as StoredLicence[]
  const productIds = [...new Set(rows.map((row) => row.product_id))]

  const names = new Map<string, string>()
  if (productIds.length > 0) {
    const { data: apps } = await db().from('loader_apps').select('id,name').in('id', productIds)
    for (const app of (apps ?? []) as Array<{ id: string; name: string }>) names.set(app.id, app.name)
  }

  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: names.get(row.product_id) ?? '(product deleted)',
    maskedCode: row.masked_code,
    days: row.days,
    deviceLimit: row.device_limit,
    note: row.note ?? '',
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    redeemedBy: row.redeemed_by,
    redeemedAt: row.redeemed_at
  }))
}

export async function revokeLicence(id: string): Promise<void> {
  const { error } = await db()
    .from('auth_licenses')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)

  /*
   * Revoking takes the product away with it. A revoke that leaves the entitlement
   * behind would be a revocation in name only: `/v1/apps` answers from the grants.
   */
  await db().from('auth_entitlements').delete().eq('license_id', id).then(
    () => undefined,
    () => undefined
  )
}

/* -------------------------------------------------------------- redeeming -- */

export interface RedeemResult {
  ok: boolean
  message?: string
  productId?: string
  expiresAt?: string | null
}

export async function redeemLicence(code: string, userId: string): Promise<RedeemResult> {
  const digest = codeDigest(code)

  const { data, error } = await db()
    .from('auth_licenses')
    .select('id,product_id,days,device_limit,expires_at,revoked_at,redeemed_at')
    .eq('code_hash', digest)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const licence = data as
    | {
        id: string
        product_id: string
        days: number | null
        device_limit: number
        expires_at: string | null
        revoked_at: string | null
        redeemed_at: string | null
      }
    | null

  if (!licence) return { ok: false, message: 'That licence key does not exist.' }
  if (licence.revoked_at) return { ok: false, message: 'That licence has been revoked.' }
  if (licence.redeemed_at) return { ok: false, message: 'That licence has already been used.' }
  if (licence.expires_at && new Date(licence.expires_at).getTime() <= Date.now()) {
    return { ok: false, message: 'That licence key has expired.' }
  }

  const now = Date.now()
  const expiresAt =
    licence.days === null ? null : new Date(now + licence.days * 24 * 60 * 60 * 1000).toISOString()

  const { error: grantError } = await db()
    .from('auth_entitlements')
    .upsert(
      { user_id: userId, product_id: licence.product_id, expires_at: expiresAt, license_id: licence.id },
      { onConflict: 'user_id,product_id' }
    )
  if (grantError) throw new Error(grantError.message)

  const { error: markError } = await db()
    .from('auth_licenses')
    .update({ redeemed_by: userId, redeemed_at: new Date().toISOString() })
    .eq('id', licence.id)
  if (markError) throw new Error(markError.message)

  return { ok: true, productId: licence.product_id, expiresAt }
}

/* ---------------------------------------------------------------- devices -- */

/** The most generous live licence on this account, or null for "no licence". */
export async function deviceLimitFor(userId: string): Promise<number | null> {
  const { data, error } = await db()
    .from('auth_entitlements')
    .select('expires_at,license_id')
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  const live = ((data ?? []) as Array<{ expires_at: string | null; license_id: string | null }>).filter(
    (row) => row.license_id && grantLive(row.expires_at)
  )
  if (live.length === 0) return null

  const ids = live.map((row) => row.license_id as string)
  const { data: licences, error: licenceError } = await db()
    .from('auth_licenses')
    .select('device_limit,revoked_at')
    .in('id', ids)

  if (licenceError) throw new Error(licenceError.message)

  const limits = ((licences ?? []) as Array<{ device_limit: number; revoked_at: string | null }>)
    .filter((row) => !row.revoked_at)
    .map((row) => row.device_limit)

  return limits.length === 0 ? null : Math.max(...limits)
}

export interface BindResult {
  ok: boolean
  message?: string
  limit?: number | null
}

/**
 * Records that this account signed in from this device, or refuses.
 *
 * Called on every sign-in. A known device is just stamped; a new one has to fit
 * inside the licence's `device_limit`, counting the devices already on the account
 * rather than the sessions — signing out of a machine must not free its slot,
 * because that is the whole point of a device limit.
 */
export async function bindDevice(userId: string, deviceId: string, deviceName: string): Promise<BindResult> {
  if (!deviceId) return { ok: true }

  const { data, error } = await db().from('auth_devices').select('id,device_id').eq('user_id', userId)
  if (error) throw new Error(error.message)

  const devices = (data ?? []) as Array<{ id: string; device_id: string }>
  const known = devices.find((row) => row.device_id === deviceId)
  const limit = await deviceLimitFor(userId)

  const slot = deviceSlot(limit, Boolean(known), devices.length)

  if (slot === 'full') {
    return {
      ok: false,
      limit,
      message: `This account is already on ${devices.length} device${devices.length === 1 ? '' : 's'}. Remove one in the panel, or ask for a licence with more slots.`
    }
  }

  const now = new Date().toISOString()
  if (known) {
    await db().from('auth_devices').update({ last_seen_at: now, device_name: deviceName }).eq('id', known.id)
    return { ok: true, limit }
  }

  const { error: insertError } = await db()
    .from('auth_devices')
    .insert({ user_id: userId, device_id: deviceId, device_name: deviceName, last_seen_at: now })
  if (insertError) throw new Error(insertError.message)

  return { ok: true, limit }
}

export interface DeviceRow {
  id: string
  deviceId: string
  deviceName: string
  firstSeenAt: string
  lastSeenAt: string
  username: string
}

export async function listDevices(): Promise<DeviceRow[]> {
  const { data, error } = await db()
    .from('auth_devices')
    .select('id,device_id,device_name,first_seen_at,last_seen_at,user_id')
    .order('last_seen_at', { ascending: false })
    .limit(300)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Array<{
    id: string
    device_id: string
    device_name: string
    first_seen_at: string
    last_seen_at: string
    user_id: string
  }>

  const ids = [...new Set(rows.map((row) => row.user_id))]
  const names = new Map<string, string>()
  if (ids.length > 0) {
    const { data: users } = await db().from('auth_users').select('id,username').in('id', ids)
    for (const user of (users ?? []) as Array<{ id: string; username: string }>) names.set(user.id, user.username)
  }

  return rows.map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    deviceName: row.device_name,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    username: names.get(row.user_id) ?? '(deleted account)'
  }))
}

export async function removeDevice(id: string): Promise<void> {
  const { error } = await db().from('auth_devices').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
