/*
 * Delegating sign-in to an external auth service (the owner's KeyAuth).
 *
 * The loader does not care who answers `/v1/login` — it wants a token, and then
 * sends that token back as `Bearer` on `/v1/apps`, `/v1/logout` and `/v1/check`.
 * That is why an external licensing service can be authoritative without touching
 * the app: this deployment forwards the four calls and returns the answers
 * untouched, so credentials created in that service work in the loader exactly as
 * they work in the app it was built alongside.
 *
 * Set `AUTH_UPSTREAM` to the base URL (for example
 * `https://indra-auth.onrender.com`). Unset, every `/v1` route answers from this
 * deployment's own tables, which is the behaviour before this existed.
 *
 * What this deliberately does not do: cache credentials, inspect passwords, or
 * keep a copy of the upstream token. The password is forwarded and forgotten; the
 * token the loader holds is the upstream's own token, passed through.
 */

const TIMEOUT_MS = 18_000

/** The configured upstream, normalised, or null when sign-in is local. */
export function upstreamBase(): string | null {
  const raw = (process.env['AUTH_UPSTREAM'] ?? '').trim()
  if (!raw) return null
  const trimmed = raw.replace(/\/+$/, '')
  return /^https?:\/\/[^\s]+$/i.test(trimmed) ? trimmed : null
}

export function upstreamEnabled(): boolean {
  return upstreamBase() !== null
}

/**
 * The app id to send upstream, when it is not the one the build carries.
 *
 * The loader's app id is compiled into the installer (1.0.2 sends
 * `7cceaf553a603ceb8d54a6c2`), so it cannot be changed by a setting. If the
 * upstream's product carries a different id, every sign-in fails with "wrong
 * username or password" — a message about the password, caused by the id.
 *
 * `AUTH_UPSTREAM_APP_ID` maps the two: the build keeps sending its own, this
 * deployment rewrites it before forwarding. Without it the value passes through
 * untouched.
 */
export function upstreamAppId(incoming: unknown): unknown {
  const mapped = (process.env['AUTH_UPSTREAM_APP_ID'] ?? '').trim()
  return mapped || incoming
}

export interface UpstreamAnswer {
  status: number
  body: unknown
}

/**
 * One call to the upstream, with the same shape the loader expects back.
 *
 * Errors are returned as `null`, and the caller turns that into the sentence the
 * sign-in screen prints — an unreachable auth service must read as "try again",
 * never as "wrong password".
 */
export async function upstreamCall(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<UpstreamAnswer | null> {
  const base = upstreamBase()
  if (!base) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${base}${path}`, {
      method: options.method ?? 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      cache: 'no-store'
    })

    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }

    return { status: response.status, body }
  } catch (error) {
    console.error('[upstream]', path, error instanceof Error ? error.message : error)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** The token the loader sent, from either header this project has ever used. */
export function tokenOf(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim() || null
  const alternate = request.headers.get('x-session-token')
  return alternate?.trim() || null
}

/** The upstream answered, but not with JSON the loader can use. */
export function unreachable(): Response {
  return Response.json(
    { detail: 'The sign-in service is having trouble. Try again in a moment.' },
    { status: 503, headers: { 'cache-control': 'no-store' } }
  )
}
