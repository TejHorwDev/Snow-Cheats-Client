/**
 * A local stand-in for Supabase, for testing without a project.
 *
 * The panel only ever talks to Supabase in two ways: PostgREST (`/rest/v1/…`) and
 * Storage (`/storage/v1/…`). This script speaks the subset of both that this code
 * actually uses — tables, filters, ordering, upsert, an embedded parent row, and the
 * signed-upload dance — backed by memory.
 *
 *   node scripts/dev-supabase.mjs          # listens on http://127.0.0.1:54321
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=dev \
 *     ADMIN_USERNAME=… ADMIN_PASSWORD=… ADMIN_SESSION_SECRET=… npm start
 *
 * It exists so the sign-in service, the catalogue and the panel can be exercised end
 * to end on a machine that cannot reach the internet — and so a broken query is found
 * before a deployment instead of after one. It is not a database: restarting it
 * forgets everything, and it enforces none of the SQL beyond what the code asks for.
 */

import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 54321)

/* ---------------------------------------------------------------- tables --- */

const tables = new Map(Object.entries({
  loader_apps: [],
  loader_config: [{ key: 'website', value: '' }],
  auth_users: [],
  auth_sessions: [],
  auth_entitlements: [],
  auth_licenses: [],
  auth_devices: []
}))

/** PostgREST's embedded resources are resolved by foreign key; this is the one FK. */
const EMBEDDED = {
  auth_sessions: { auth_users: { local: 'user_id', foreign: 'id', table: 'auth_users' } }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const value = (raw) => {
  let text = raw
  try {
    text = decodeURIComponent(raw)
  } catch {
    /* keep the raw text */
  }
  if (text === 'null') return null
  if (text === 'true') return true
  if (text === 'false') return false
  return text
}

function json(response, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-range': `0-${Math.max(0, (Array.isArray(body) ? body.length : 1) - 1)}/${Array.isArray(body) ? body.length : 1}`,
    ...headers
  })
  response.end(payload)
}

/* --------------------------------------------------------------- filters --- */

/**
 * Splits a `select` list on commas that are not inside parentheses.
 *
 * `token_hash,auth_users(username,banned)` is three columns and one embedded row,
 * and a plain `split(',')` turns it into "auth_users(username" and "banned)", which
 * silently drops the join.
 */
function splitSelect(raw) {
  const parts = []
  let depth = 0
  let current = ''
  for (const character of raw) {
    if (character === '(') depth += 1
    if (character === ')') depth = Math.max(0, depth - 1)
    if (character === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  if (current) parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

function matches(row, filters) {
  return filters.every(({ column, op, operand }) => {
    const actual = row[column]
    if (op === 'eq') return String(actual) === operand
    if (op === 'neq') return String(actual) !== operand
    if (op === 'in') {
      // `id=in.(a,b)` — the parentheses belong to the syntax, not to the values.
      const list = String(operand)
        .replace(/^\(/, '')
        .replace(/\)$/, '')
        .split(',')
        .map((entry) => entry.trim().replace(/^"|"$/g, ''))
      return list.includes(String(actual))
    }
    if (op === 'lt') return new Date(String(actual)).getTime() < new Date(operand).getTime()
    if (op === 'gt') return new Date(String(actual)).getTime() > new Date(operand).getTime()
    if (op === 'is') return operand === 'null' ? actual === null : String(actual) === operand
    return true
  })
}

function parseQuery(url, reserved) {
  const filters = []
  let order = null
  let limit = null
  let embedded = []

  for (const [key, raw] of url.searchParams) {
    // An embedded resource: `select=token_hash,auth_users(username,banned)`.
    if (key === 'select') {
      for (const part of splitSelect(raw)) {
        const nested = /^([a-z_]+)\(([^)]*)\)$/.exec(part)
        if (nested) embedded.push({ name: nested[1], columns: splitSelect(nested[2]) })
      }
      continue
    }

    if (reserved.has(key)) continue
    if (key === 'order') {
      const [column, direction] = raw.split('.')
      order = { column, descending: direction === 'desc' }
      continue
    }
    if (key === 'limit') {
      limit = Number(raw)
      continue
    }
    if (key === 'offset') continue

    const [op, ...rest] = raw.split('.')
    filters.push({ column: key, op, operand: value(rest.join('.')) })
  }

  return { filters, order, limit, embedded }
}

function selectColumns(raw) {
  if (!raw || raw === '*') return null
  const columns = []
  for (const part of splitSelect(raw)) {
    if (part.includes('(')) continue
    columns.push(part)
  }
  return columns.length > 0 ? columns : null
}

function project(row, columns) {
  if (!columns) return { ...row }
  const picked = {}
  for (const column of columns) picked[column] = row[column]
  return picked
}

/* ------------------------------------------------------------------ main --- */

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`)
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  let body = null
  if (raw) {
    try {
      body = JSON.parse(raw)
    } catch {
      body = raw
    }
  }

  const path = url.pathname

  /* ---------------------------------------------------------- storage --- */

  if (path.startsWith('/storage/v1/object/list/')) {
    return json(response, 200, [])
  }
  if (path.startsWith('/storage/v1/object/upload/sign/')) {
    // The browser PUTs to this signed address; nothing here checks the token.
    return json(response, 200, { url: `/storage/v1/object/upload/${path.split('/').slice(-2).join('/')}` })
  }
  if (path.startsWith('/storage/v1/object/sign/')) {
    return json(response, 200, { signedURL: `/storage/v1/object/public/${path.split('/').slice(-2).join('/')}` })
  }
  if (path.startsWith('/storage/v1/object/public/')) {
    response.writeHead(200, { 'content-type': 'application/octet-stream' })
    return response.end(Buffer.alloc(0))
  }
  if (path.startsWith('/storage/v1/object/')) {
    return json(response, 200, { ok: true })
  }
  if (path === '/rest/v1/' || path === '/') {
    return json(response, 200, { ok: true })
  }

  /* ------------------------------------------------------------- rest --- */

  const tableMatch = /^\/rest\/v1\/([a-z_]+)$/.exec(path)
  if (!tableMatch) return json(response, 404, { message: `no route for ${path}`, code: '404' })

  const table = tableMatch[1]
  if (!tables.has(table)) {
    return json(response, 400, {
      message: `relation "public.${table}" does not exist`,
      code: '42P01'
    })
  }

  const rows = /** @type {Array<Record<string, any>>} */ (tables.get(table))
  const reserved = new Set(['select', 'columns', 'on_conflict'])
  const { filters, order, limit, embedded } = parseQuery(url, reserved)
  const columns = selectColumns(url.searchParams.get('select'))
  const single = (request.headers.accept ?? '').includes('vnd.pgrst.object+json')
  const wantsRows = /return=representation/.test(request.headers.prefer ?? '')
  const countExact = /count=exact/.test(request.headers.prefer ?? '')

  const embed = (row) => {
    const out = project(row, columns)
    for (const nested of embedded) {
      const relation = EMBEDDED[table]?.[nested.name]
      if (!relation) continue
      const parent = /** @type {Array<Record<string, any>>} */ (tables.get(relation.table)).find?.(
        (candidate) => candidate[relation.foreign] === row[relation.local]
      )
      out[nested.name] = parent
        ? Object.fromEntries(nested.columns.map((column) => [column, parent[column]]))
        : null
    }
    return out
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    let found = rows.filter((row) => matches(row, filters))
    if (order) {
      found = [...found].sort((left, right) => {
        const a = String(left[order.column] ?? '')
        const b = String(right[order.column] ?? '')
        return order.descending ? b.localeCompare(a) : a.localeCompare(b)
      })
    }
    if (limit !== null) found = found.slice(0, limit)

    if (countExact) {
      response.setHeader('content-range', `0-0/${rows.filter((row) => matches(row, filters)).length}`)
    }
    if (request.method === 'HEAD') {
      response.writeHead(200, { 'content-type': 'application/json' })
      return response.end()
    }
    if (single) {
      if (found.length !== 1) {
        return json(response, 406, {
          message: `JSON object requested, multiple (or no) rows returned`,
          details: `Results contain ${found.length} rows`,
          code: 'PGRST116'
        })
      }
      return json(response, 200, embed(found[0]))
    }
    return json(response, 200, found.map(embed))
  }

  if (request.method === 'POST') {
    const incoming = Array.isArray(body) ? body : [body]
    const upsert = /resolution=merge-duplicates/.test(request.headers.prefer ?? '')
    const conflict = url.searchParams.get('on_conflict')
    const inserted = []

    for (const draft of incoming) {
      if (!draft || typeof draft !== 'object') continue
      const row = { ...draft }

      if (table === 'loader_apps' || table === 'auth_users') {
        if (!row.id) row.id = randomUUID()
      }
      if (table === 'auth_users' && !row.created_at) row.created_at = new Date().toISOString()
      if (table === 'auth_sessions' && !row.created_at) row.created_at = new Date().toISOString()
      if (table === 'auth_entitlements' && !row.created_at) row.created_at = new Date().toISOString()
      if (table === 'auth_licenses') {
        if (!row.id) row.id = randomUUID()
        if (!row.created_at) row.created_at = new Date().toISOString()
        if (row.device_limit === undefined) row.device_limit = 1
        if (!row.note) row.note = ''
        if (rows.some((candidate) => candidate.code_hash === row.code_hash)) {
          return json(response, 409, {
            message: 'duplicate key value violates unique constraint "auth_licenses_code_hash_key"',
            code: '23505'
          })
        }
      }
      if (table === 'auth_devices') {
        if (!row.id) row.id = randomUUID()
        if (!row.first_seen_at) row.first_seen_at = new Date().toISOString()
        if (!row.last_seen_at) row.last_seen_at = row.first_seen_at
        if (!row.device_name) row.device_name = ''
        if (
          rows.some(
            (candidate) => candidate.user_id === row.user_id && candidate.device_id === row.device_id
          )
        ) {
          return json(response, 409, {
            message: 'duplicate key value violates unique constraint "auth_devices_user_id_device_id_key"',
            code: '23505'
          })
        }
      }
      if (table === 'loader_apps' && !row.created_at) row.created_at = new Date().toISOString()

      /* `on_conflict` may name several columns: `user_id,product_id`. */
      const conflictColumns = conflict ? conflict.split(',').map((entry) => entry.trim()) : []
      const existing = upsert && conflictColumns.length
        ? rows.findIndex((candidate) =>
            conflictColumns.every((column) => String(candidate[column]) === String(row[column]))
          )
        : -1

      if (existing >= 0) {
        rows[existing] = { ...rows[existing], ...row }
        inserted.push(rows[existing])
        continue
      }

      if (table === 'auth_users' && rows.some((candidate) => candidate.username === row.username)) {
        return json(response, 409, {
          message: `duplicate key value violates unique constraint "auth_users_username_key"`,
          code: '23505'
        })
      }

      rows.push(row)
      inserted.push(row)
    }

    if (request.headers.prefer?.includes('count=exact')) {
      // `insert(...).select()` asks for the rows back; nothing else needs the count.
    }

    if (wantsRows || single) {
      if (single) return json(response, 201, embed(inserted[0]))
      return json(response, 201, inserted.map(embed))
    }
    return json(response, 201, undefined)
  }

  if (request.method === 'PATCH') {
    const changed = []
    for (const row of rows) {
      if (!matches(row, filters)) continue
      for (const [key, entry] of Object.entries(body ?? {})) row[key] = entry
      changed.push(row)
    }
    if (wantsRows) return json(response, 200, changed.map(embed))
    return json(response, 204, undefined)
  }

  if (request.method === 'DELETE') {
    const kept = rows.filter((row) => !matches(row, filters))
    const removed = rows.length - kept.length
    tables.set(table, kept)
    if (wantsRows) return json(response, 200, [])
    response.writeHead(204, { 'content-range': `*/${removed}` })
    return response.end()
  }

  return json(response, 405, { message: `${request.method} is not supported here`, code: '405' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`stand-in Supabase listening on http://127.0.0.1:${PORT}`)
  console.log('tables: ' + [...tables.keys()].join(', '))
})
