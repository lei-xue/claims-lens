import { useState } from 'react'
import { Seg } from '../components/Seg'
import { api, money, shortDate, useApi } from '../lib/api'
import { sendToInspector } from '../lib/handoff'
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
      if (!kind) throw new Error('This does not look like an 835 or 837 file (no ST*835 / ST*837 segment).')
      if (kind === '835') {
        const r = await api<Result835>(`/import/835?name=${encodeURIComponent(name ?? 'pasted.835')}`, { method: 'POST', body: text, headers: { 'content-type': 'text/plain' } })
        const detail = [
          `${r.claims} claim${r.claims === 1 ? '' : 's'} · ${r.matched} matched to submitted 837s`,
          `${r.newDenials} new denial${r.newDenials === 1 ? '' : 's'} added to the worklist`,
          ...(r.resolved ? [`${r.resolved} open denial${r.resolved === 1 ? '' : 's'} resolved by this payment`] : []),
          ...(r.unmatched.length ? [`No 837 on file for: ${r.unmatched.join(', ')}`] : []),
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
          <Seg as="h1" parts={['REMITTANCES', list.data ? list.data.length : '…']} />
          <p>Drop an 835 to post it: every claim is matched to the 837 you sent, denials open on the worklist and denials you were already working resolve when the money arrives.</p>
        </div>
        <button className="btn" onClick={tryDemo} disabled={busy}>Generate a demo 837 + 835</button>
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
        <b>{busy ? 'Importing…' : 'Drop 835 or 837 files here, or click to choose'}</b>
        <span className="small muted">Files are parsed and balanced first; a remittance that was already imported is refused.</span>
      </label>

      {msg && (
        <div className={`issues ${msg.tone === 'ok' ? 'ok' : 'err'}`} style={{ marginTop: 14 }} role="status">
          <b>{msg.text}</b>
          {msg.detail && msg.detail.length > 0 && <ul>{msg.detail.map((d, i) => <li key={i}>{d}</li>)}</ul>}
          {msg.tone === 'ok' && <a href="#/work" className="small" style={{ display: 'inline-block', marginTop: 6 }}>Open the worklist →</a>}
        </div>
      )}

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="pad"><h2 style={{ fontSize: 17 }}>Imported</h2><p className="small muted">Only remittances that fail a balancing check are flagged.</p></div>
        <div className="scroll-x">
          <table className="t">
            <thead><tr><th>Paid</th><th>Payer</th><th>Trace</th><th className="num">Amount</th><th className="num">Claims</th><th className="num">Denials</th><th><span className="sr-only">Problems</span></th><th /></tr></thead>
            <tbody>
              {list.data?.slice(0, 100).map((r) => (
                <tr key={r.id}>
                  <td className="small">{shortDate(r.date)}</td>
                  <td>{titleCase(r.payer)}</td>
                  <td className="mono small">{r.trace}</td>
                  <td className="num">{money(r.amount)}<div className="small muted">{r.method === 'NON' ? 'no funds' : r.method}</div></td>
                  <td className="num">{r.claims}{r.unmatched > 0 && <div className="small deny-text">{r.unmatched} unmatched</div>}</td>
                  <td className="num">{r.denials || '—'}</td>
                  <td>{r.issues.length > 0 && <span className="pill deny">{r.issues.length} issue{r.issues.length === 1 ? '' : 's'}</span>}</td>
                  <td><button className="btn" onClick={async () => sendToInspector(await api<string>(`/remittances/${r.id}/raw`))}>Inspect</button></td>
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
