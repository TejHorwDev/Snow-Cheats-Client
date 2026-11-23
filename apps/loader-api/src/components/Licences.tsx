'use client'

import { useEffect, useState } from 'react'

/*
 * Licence keys and the devices they are used from.
 *
 * The flow this page serves: mint a key for a product, sell it, the customer
 * redeems it, and their loader opens the card until the days run out or the key is
 * revoked. The device table is the other half — a two-device key that has been used
 * on a machine the customer no longer has needs one row deleted, and that is a
 * support action the owner must be able to do without a database console.
 *
 * A key's plaintext appears exactly once, in the response to minting it. There is
 * no "show key" button anywhere because there is nothing left to show: only the
 * hash and the last four characters are stored.
 */

interface Licence {
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

interface Device {
  id: string
  deviceId: string
  deviceName: string
  firstSeenAt: string
  lastSeenAt: string
  username: string
}

interface Product {
  id: string
  name: string
}

interface Minted {
  id: string
  code: string
  maskedCode: string
  productId: string
  days: number | null
  deviceLimit: number
}

function day(value: string | null): string {
  if (!value) return '—'
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? '—' : at.toISOString().slice(0, 10)
}

function stateOf(licence: Licence): { label: string; tone: string } {
  if (licence.revokedAt) return { label: 'revoked', tone: 'off' }
  if (licence.redeemedAt) return { label: 'in use', tone: 'on' }
  if (licence.expiresAt && new Date(licence.expiresAt).getTime() <= Date.now()) {
    return { label: 'expired key', tone: 'off' }
  }
  return { label: 'unused', tone: 'idle' }
}

export default function Licences(): React.JSX.Element {
  const [licences, setLicences] = useState<Licence[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [minted, setMinted] = useState<Minted[]>([])

  const [productId, setProductId] = useState('')
  const [days, setDays] = useState('30')
  const [deviceLimit, setDeviceLimit] = useState('1')
  const [count, setCount] = useState('1')
  const [note, setNote] = useState('')
  const [redeemUser, setRedeemUser] = useState('')
  const [redeemCode, setRedeemCode] = useState('')

  async function load(): Promise<void> {
    try {
      const response = await fetch('/api/admin/licenses', { cache: 'no-store' })
      const payload = (await response.json()) as {
        licences?: Licence[]
        devices?: Device[]
        products?: Product[]
      }
      setLicences(payload.licences ?? [])
      setDevices(payload.devices ?? [])
      setProducts(payload.products ?? [])
      setProductId((current) => current || (payload.products?.[0]?.id ?? ''))
    } catch {
      setStatus('Could not reach the server.')
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function send(path: string, method: string, payload?: unknown): Promise<unknown | null> {
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
        return null
      }
      return await response.json().catch(() => ({}))
    } catch {
      setStatus('Could not reach the server.')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function mint(): Promise<void> {
    const result = (await send('/api/admin/licenses', 'POST', {
      productId,
      days: days.trim() === '' ? null : Number(days),
      deviceLimit: Number(deviceLimit),
      count: Number(count),
      note
    })) as { minted?: Minted[] } | null
    if (!result?.minted) return
    setMinted(result.minted)
    setNote('')
    await load()
  }

  async function redeem(): Promise<void> {
    const done = await send('/api/admin/licenses/redeem', 'POST', {
      username: redeemUser.trim(),
      code: redeemCode.trim()
    })
    if (!done) return
    setStatus(`Redeemed for ${redeemUser.trim()}.`)
    setRedeemCode('')
    await load()
  }

  async function revoke(id: string): Promise<void> {
    if (!window.confirm('Revoke this key? If it is in use, the product leaves that account.')) return
    const done = await send(`/api/admin/licenses/${id}/revoke`, 'POST')
    if (done) await load()
  }

  async function forget(id: string): Promise<void> {
    if (!window.confirm('Remove this device? The customer can sign in from a new one.')) return
    const done = await send(`/api/admin/devices/${id}`, 'DELETE')
    if (done) await load()
  }

  return (
    <>
      {status && <p className="note note--warn">{status}</p>}

      <div className="grid">
      <section className="panel span-6">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Mint keys</h2>
            <p className="panel-sub">A key&apos;s plaintext is shown once, here, and never again.</p>
          </div>
        </div>
        <div className="row">
          <label className="field">
            <span>Product</span>
            <select value={productId} onChange={(event) => setProductId(event.target.value)}>
              {products.length === 0 && <option value="">No products yet</option>}
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Days (empty = lifetime)</span>
            <input value={days} onChange={(event) => setDays(event.target.value)} inputMode="numeric" />
          </label>
          <label className="field">
            <span>Devices per key</span>
            <input
              value={deviceLimit}
              onChange={(event) => setDeviceLimit(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="field">
            <span>How many</span>
            <input value={count} onChange={(event) => setCount(event.target.value)} inputMode="numeric" />
          </label>
        </div>
        <label className="field">
          <span>Note (who it is for)</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="optional" />
        </label>
        <button className="btn" onClick={() => void mint()} disabled={busy !== null || !productId}>
          {busy === '/api/admin/licenses' ? 'Minting…' : 'Mint keys'}
        </button>

        {minted.length > 0 && (
          <div className="note">
            <p>
              <strong>Copy these now — they are not shown again.</strong>
            </p>
            <pre className="mono">{minted.map((row) => row.code).join('\n')}</pre>
            <button className="btn btn--ghost" onClick={() => void navigator.clipboard?.writeText(minted.map((row) => row.code).join('\n'))}>
              Copy all
            </button>
          </div>
        )}
      </section>

      <section className="panel span-6">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Redeem a key for a customer</h2>
            <p className="panel-sub">The loader asks for a username and password only, so a key is redeemed here.</p>
          </div>
        </div>
        <p className="hint">
          The loader asks for a username and password only, so a key is redeemed here: type the
          account and the key, and the product lands on that account with the licence&apos;s expiry.
        </p>
        <div className="row">
          <label className="field">
            <span>Username</span>
            <input value={redeemUser} onChange={(event) => setRedeemUser(event.target.value)} placeholder="customer" />
          </label>
          <label className="field">
            <span>Licence key</span>
            <input
              value={redeemCode}
              onChange={(event) => setRedeemCode(event.target.value)}
              placeholder="SNOW-XXXX-XXXX-XXXX"
              className="mono"
            />
          </label>
        </div>
        <button
          className="btn"
          onClick={() => void redeem()}
          disabled={busy !== null || !redeemUser.trim() || !redeemCode.trim()}
        >
          {busy === '/api/admin/licenses/redeem' ? 'Redeeming…' : 'Redeem'}
        </button>
      </section>

      <section className="panel span-12">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Keys</h2>
            <p className="panel-sub">What has been minted, and what each one is doing now.</p>
          </div>
          <span className="panel-action">{licences.length} total</span>
        </div>
        {!loaded && <p className="hint">Loading…</p>}
        {loaded && licences.length === 0 && <p className="hint">No keys yet.</p>}
        {licences.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Product</th>
                <th>Days</th>
                <th>Devices</th>
                <th>State</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {licences.map((licence) => {
                const state = stateOf(licence)
                return (
                  <tr key={licence.id}>
                    <td className="mono">{licence.maskedCode}</td>
                    <td>{licence.productName}</td>
                    <td>{licence.days === null ? 'lifetime' : licence.days}</td>
                    <td>{licence.deviceLimit}</td>
                    <td>
                      <span className="dot" data-tone={state.tone} /> {state.label}
                    </td>
                    <td className="hint">{licence.note || '—'}</td>
                    <td>
                      {!licence.revokedAt && (
                        <button
                          className="btn btn--ghost btn--small"
                          onClick={() => void revoke(licence.id)}
                          disabled={busy !== null}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel span-12">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Devices</h2>
            <p className="panel-sub">Every machine a customer has signed in from.</p>
          </div>
          <span className="panel-action">{devices.length} seen</span>
        </div>
        <p className="hint">
          Every machine a customer has signed in from. Removing one frees its slot; the account keeps
          its session until it expires.
        </p>
        {loaded && devices.length === 0 && <p className="hint">No devices have signed in yet.</p>}
        {devices.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Device</th>
                <th>First seen</th>
                <th>Last seen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id}>
                  <td className="mono">{device.username}</td>
                  <td>
                    {device.deviceName || 'Device'}
                    <br />
                    <span className="mono hint">{device.deviceId.slice(0, 12)}…</span>
                  </td>
                  <td className="hint">{day(device.firstSeenAt)}</td>
                  <td className="hint">{day(device.lastSeenAt)}</td>
                  <td>
                    <button
                      className="btn btn--ghost btn--small"
                      onClick={() => void forget(device.id)}
                      disabled={busy !== null}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      </div>
    </>
  )
}
