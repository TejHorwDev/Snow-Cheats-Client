'use client'

import { useEffect, useState } from 'react'

/*
 * The customer accounts, and what each one owns.
 *
 * This page is the other half of the loader's sign-in contract: the app asks who
 * somebody is and what they bought, and this is where both answers are written
 * down. Before it existed the panel could publish a product that nobody could
 * unlock.
 *
 * The password is set here and shown nowhere. There is no reset e-mail, no
 * verification link and no "forgot password" — the owner types a new one and tells
 * the customer, which is the only workflow a single-owner deployment needs.
 */

interface User {
  id: string
  username: string
  banned: boolean
  note: string
  createdAt: string
  lastLoginAt: string | null
  products: string[]
}

interface Product {
  id: string
  name: string
  keyauthAppId: string
}

export default function Accounts(): React.JSX.Element {
  const [users, setUsers] = useState<User[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [note, setNote] = useState('')
  const [productId, setProductId] = useState('')
  const [days, setDays] = useState('30')
  const [deviceLimit, setDeviceLimit] = useState('1')
  const [mintedKey, setMintedKey] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')

  async function load(): Promise<void> {
    try {
      const response = await fetch('/api/admin/accounts', { cache: 'no-store' })
      const payload = (await response.json()) as { users?: User[]; products?: Product[] }
      setUsers(payload.users ?? [])
      setProducts(payload.products ?? [])
    } catch {
      setStatus('Could not reach the server.')
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function send(path: string, method: string, payload?: unknown): Promise<boolean> {
    setBusy(path)
    setStatus(null)
    try {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload)
      })
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { error?: string }
        setStatus(detail.error ?? `That did not work (HTTP ${response.status}).`)
        return false
      }
      await load()
      return true
    } catch {
      setStatus('Could not reach the server.')
      return false
    } finally {
      setBusy(null)
    }
  }

  /** Like send(), but hands back the body — creating an account returns its key. */
  async function post(path: string, method: string, payload: unknown): Promise<unknown | null> {
    setBusy(path)
    setStatus(null)
    try {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { error?: string }
        setStatus(detail.error ?? `That did not work (HTTP ${response.status}).`)
        return null
      }
      await load()
      return await response.json().catch(() => ({}))
    } catch {
      setStatus('Could not reach the server.')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function create(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const made = await post('/api/admin/accounts', 'POST', {
      username,
      password,
      note,
      productId: productId || undefined,
      days: days.trim() === '' ? null : Number(days),
      deviceLimit: Number(deviceLimit)
    })
    if (!made) return
    const licence = (made as { licence?: { code: string } }).licence
    setMintedKey(licence?.code ?? null)
    setStatus(
      licence
        ? `“${username.trim().toLowerCase()}” can sign in now, with the product attached.`
        : `“${username.trim().toLowerCase()}” can sign in now — no product yet, so every card stays locked.`
    )
    setUsername('')
    setPassword('')
    setNote('')
  }

  async function grant(user: User, productId: string): Promise<void> {
    const next = user.products.includes(productId)
      ? user.products.filter((id) => id !== productId)
      : [...user.products, productId]
    await send(`/api/admin/accounts/${user.id}`, 'PATCH', { productIds: next })
  }

  if (!loaded) return <div className="empty">Loading…</div>

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">New account</h2>
            <p className="panel-sub">
              Customers do not sign up. Create the account, give them the username and password, and
              they sign in on the loader.
            </p>
          </div>
        </div>
        <form onSubmit={create}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label className="label" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                value={username}
                autoComplete="off"
                placeholder="customer"
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                autoComplete="new-password"
                placeholder="at least 8 characters"
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label className="label" htmlFor="note">
                Note
              </label>
              <input
                id="note"
                value={note}
                placeholder="order number, Discord name…"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>
          <div className="row" style={{ alignItems: 'flex-start', marginTop: 12 }}>
            <div className="field" style={{ flex: 2, minWidth: 200 }}>
              <label className="label" htmlFor="product">
                Product
              </label>
              <select
                id="product"
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
              >
                <option value="">No product yet</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 130 }}>
              <label className="label" htmlFor="days">
                Days
              </label>
              <input
                id="days"
                value={days}
                inputMode="numeric"
                placeholder="empty = lifetime"
                onChange={(event) => setDays(event.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 130 }}>
              <label className="label" htmlFor="devices">
                Devices
              </label>
              <input
                id="devices"
                value={deviceLimit}
                inputMode="numeric"
                onChange={(event) => setDeviceLimit(event.target.value)}
              />
            </div>
          </div>
          <button
            className="btn primary"
            type="submit"
            disabled={busy !== null || username.trim().length < 3 || password.length < 8}
          >
            Create account
          </button>
        </form>
        {status ? <p className="hint" style={{ marginTop: 10 }}>{status}</p> : null}
        {mintedKey ? (
          <p className="hint" style={{ marginTop: 6 }}>
            Licence key (shown once): <span className="mono">{mintedKey}</span>
          </p>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Accounts</h2>
            <p className="panel-sub">
              {users.length} customer{users.length === 1 ? '' : 's'} on this deployment.
            </p>
          </div>
        </div>
        {users.length === 0 ? (
          <div className="empty">No accounts yet. The first one you create can download straight away.</div>
        ) : (
          <div className="rows">
            {users.map((user) => (
              <div key={user.id} style={{ borderTop: '1px solid var(--line)', padding: '14px 0' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="row-name mono">{user.username}</span>
                    <span className={`pill ${user.banned ? 'off' : 'ok'}`}>
                      {user.banned ? 'banned' : 'active'}
                    </span>
                    {user.note ? <span className="hint">{user.note}</span> : null}
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      className="row-action"
                      onClick={() => setOpen(open === user.id ? null : user.id)}
                    >
                      {open === user.id ? 'Close' : 'Manage'}
                    </button>
                    <button
                      className="row-action"
                      disabled={busy !== null}
                      onClick={() =>
                        void send(`/api/admin/accounts/${user.id}`, 'PATCH', { banned: !user.banned })
                      }
                    >
                      {user.banned ? 'Unban' : 'Ban'}
                    </button>
                    <button
                      className="row-action danger"
                      disabled={busy !== null}
                      onClick={() => void send(`/api/admin/accounts/${user.id}`, 'DELETE')}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <p className="hint" style={{ marginTop: 6 }}>
                  Owns {user.products.length} of {products.length} products ·{' '}
                  {user.lastLoginAt
                    ? `last signed in ${new Date(user.lastLoginAt).toLocaleString()}`
                    : 'never signed in'}
                </p>

                {open === user.id ? (
                  <div style={{ marginTop: 12 }}>
                    <p className="label">Products this account can open</p>
                    {products.length === 0 ? (
                      <p className="hint">Publish a product first — the catalogue is empty.</p>
                    ) : (
                      <div className="row" style={{ gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                        {products.map((product) => (
                          <label key={product.id} className="row" style={{ gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={user.products.includes(product.id)}
                              disabled={busy !== null}
                              onChange={() => void grant(user, product.id)}
                            />
                            <span>{product.name}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    <div className="row" style={{ gap: 8, marginTop: 14 }}>
                      <input
                        type="password"
                        value={newPassword}
                        autoComplete="new-password"
                        placeholder="new password (8+ characters)"
                        onChange={(event) => setNewPassword(event.target.value)}
                      />
                      <button
                        className="btn small"
                        disabled={busy !== null || newPassword.length < 8}
                        onClick={async () => {
                          const ok = await send(`/api/admin/accounts/${user.id}`, 'PATCH', {
                            password: newPassword
                          })
                          if (ok) {
                            setNewPassword('')
                            setStatus(`Password changed for “${user.username}”. Every session was ended.`)
                          }
                        }}
                      >
                        Set password
                      </button>
                    </div>
                    <p className="hint" style={{ marginTop: 6 }}>
                      Changing the password signs this account out everywhere.
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
