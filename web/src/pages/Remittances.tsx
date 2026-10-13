import { useState } from 'react'
import { api, money, shortDate, useApi } from '../lib/api'
import { sample } from '../lib/generate'
import { titleCase } from './Worklist'

type Remit = { id: number; trace: string; payer: string; amount: number; date: string; method: string; importedAt: string; fileName: string | null; claims: number; unmatched: number; denials: number; issues: { level: string; message: string }[] }
type Result835 = { payer: string; payment: number; claims: number; matched: number; unmatched: string[]; newDenials: number; resolved: number; issues: { level: string; message: string }[] }
type Result837 = { claims: number; duplicates: number }

export default function Remittances() {
  const list = useApi<Remit[]>('/remittances')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string; detail?: string[] } | null>(null)

  const upload = async (text: string, name?: string) => {
    setBusy(true)
    setMsg(null)
    const kind = /ST\*835/.test(text) ? '835' : /ST\*837/.test(text) ? '837' : null
    try {
      if (!kind) throw new Error('This isn’t an 835 payment file or an 837 claim file.')
      if (kind === '835') {
        const r = await api<Result835>(`/import/835?name=${encodeURIComponent(name ?? 'pasted.835')}`, { method: 'POST', body: text, headers: { 'content-type': 'text/plain' } })
        const detail = [
          `${r.claims} claim${r.claims === 1 ? '' : 's'} · ${r.matched} matched to your billed claims`,
          `${r.newDenials} new denial${r.newDenials === 1 ? '' : 's'} added to the work queue`,
          ...(r.resolved ? [`${r.resolved} open denial${r.resolved === 1 ? '' : 's'} resolved by this payment`] : []),
          ...(r.unmatched.length ? [`No billed claim found for: ${r.unmatched.join(', ')}`] : []),
          ...r.issues.map((i) => `${i.level}: ${i.message}`),
        ]
        setMsg({ tone: 'ok', text: `Imported ${money(r.payment)} from ${titleCase(r.payer)}`, detail })
      } else {
        const r = await api<Result837>('/import/837', { method: 'POST', body: text, headers: { 'content-type': 'text/plain' } })
        setMsg({ tone: 'ok', text: `Imported ${r.claims} submitted claim${r.claims === 1 ? '' : 's'}`, detail: r.duplicates ? [`${r.duplicates} already on file were skipped`] : [] })
      }
      list.reload()
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  const tryDemo = async () => {
    // a fresh claim + its denial, so the full loop can be tried without real files
    const s = sample('noAuth', Date.now() % 100000)
    s.claim.id = `MGFMDEMO${String(Date.now()).slice(-6)}`
    const { to837, to835 } = await import('../lib/generate')
    await upload(to837([s.claim]), 'demo.837')
    await upload(to835([s.claim], Date.now() % 1e8), 'demo.835')
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Imports</h1>
          <p>Upload the payment files your insurers send (835). Each payment is matched to the claim you billed; anything denied goes to the work queue.</p>
        </div>
        <button className="btn" onClick={tryDemo} disabled={busy}>Try with a sample file</button>
      </div>

      <label
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => {
          e.preventDefault()
          setOver(false)
          for (const f of Array.from(e.dataTransfer.files)) await upload(await f.text(), f.name)
        }}
      >
        <input type="file" hidden multiple accept=".835,.837,.edi,.txt,.x12" onChange={async (e) => {
          for (const f of Array.from(e.target.files ?? [])) await upload(await f.text(), f.name)
          e.target.value = ''
        }} />
        <b>{busy ? 'Importing…' : 'Drop payment files here, or click to choose'}</b>
        <span className="small muted">835 payment files or 837 claim files. The same payment can’t be imported twice.</span>
      </label>

      {msg && (
        <div className={`issues ${msg.tone === 'ok' ? 'ok' : 'err'}`} style={{ marginTop: 14 }} role="status">
          <b>{msg.text}</b>
          {msg.detail && msg.detail.length > 0 && <ul>{msg.detail.map((d, i) => <li key={i}>{d}</li>)}</ul>}
          {msg.tone === 'ok' && <a href="#/work" className="small" style={{ display: 'inline-block', marginTop: 6 }}>Open the work queue</a>}
        </div>
      )}

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="pad"><h2 style={{ fontSize: 17 }}>Recent payments</h2></div>
        <div className="scroll-x">
          <table className="t">
            <thead><tr><th>Date</th><th>Payer</th><th className="num">Amount</th><th className="num">Claims</th><th className="num">Denied</th><th><span className="sr-only">Problems</span></th></tr></thead>
            <tbody>
              {list.data?.slice(0, 100).map((r) => (
                <tr key={r.id}>
                  <td className="small">{shortDate(r.date)}</td>
                  <td>{titleCase(r.payer)}</td>
                  <td className="num">{money(r.amount)}</td>
                  <td className="num">{r.claims}{r.unmatched > 0 && <div className="small deny-text">{r.unmatched} unmatched</div>}</td>
                  <td className="num">{r.denials || '—'}</td>
                  <td>{r.issues.length > 0 && <span className="pill deny">{r.issues.length} issue{r.issues.length === 1 ? '' : 's'}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.error && <div className="empty">{list.error}</div>}
        </div>
      </div>
    </>
  )
}
