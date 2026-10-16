import { useEffect, useState } from 'react'
import { AdjChip, RemarkChip, useOpenCode } from '../components/CodeDrawer'
import { api, download, initials, money, money0, shortDate, useApi, useAuth } from '../lib/api'
import { PROCEDURES } from '../lib/generate'

type Row = {
  id: number; status: Status; primaryCode: string; title: string; codes: string[]; category: string; amount: number; recovered: number
  deniedOn: string; appealBy: string; age: number; patientControl: string; patient: string; serviceDate: string; payer: string; owner: string | null; ownerId: number | null
}
type Status = 'new' | 'in_progress' | 'resubmitted' | 'appealed' | 'resolved' | 'written_off'
type List = { rows: Row[]; total: number; amount: number; page: number; pageSize: number }
type Money = { n: number; amount: number }
type Kpis = {
  openCount: number; openAmount: number; recovered30d: number; avgDaysToResolve: number | null; denialRate90d: number
  overdue: Money; dueSoon: Money; newThisWeek: Money; team: { owner: string; open: number; amount: number }[]
}
type Lookups = { payers: { id: number; name: string }[]; users: { id: number; name: string; role: string }[]; categories: string[] }
type Adj = { group: string; reason: string; amount: number }
type Detail = {
  denial: Row & { payerId: number; claimId: number | null; fullDenial: boolean; payer: string; owner: string | null }
  claim: { id: number; patientControl: string; patientName: string; memberId: string; serviceDate: string; diagnoses: string[]; totalCharge: number } | null
  payment: { trace: string; paymentDate: string; payerClaimId: string; paid: number; patientResp: number; charge: number } | null
  claimAdjustments: Adj[]
  recon: { lineId: number; lineNo: number; procedure: string; modifiers: string[]; units: number; billed: number; allowed: number | null; paid: number | null; remarks: string[]; adjustments: Adj[]; missing: boolean }[]
  explanation: { title: string; plain: string; causes: string[]; fix: string[]; owner: string } | null
  history: { id: number; kind: string; body: Record<string, unknown>; at: string; user: string | null }[]
  appeal: string | null
}

export const STATUS_LABEL: Record<Status, string> = {
  new: 'New', in_progress: 'In progress', resubmitted: 'Waiting on payer', appealed: 'Appeal sent', resolved: 'Recovered', written_off: 'Written off',
}
export const StatusPill = ({ s }: { s: Status }) => <span className={`status ${s}`}>{STATUS_LABEL[s]}</span>

const daysUntil = (iso: string) => Math.ceil((Date.parse(iso + 'T12:00:00') - Date.now()) / 86400000)
function Due({ iso, closed }: { iso: string; closed?: boolean }) {
  if (closed) return <span className="due ok">—</span>
  const d = daysUntil(iso)
  if (d < 0) return <span className="due late">Overdue {-d}d</span>
  if (d <= 14) return <span className="due soon">{d === 0 ? 'Due today' : `Due in ${d}d`}</span>
  return <span className="due ok">{shortDate(iso)}</span>
}

const VIEWS = [
  { key: 'open', label: 'All open', q: { status: 'open' } },
  { key: 'mine', label: 'Mine', q: { status: 'open', owner: 'me' } },
  { key: 'unassigned', label: 'Unassigned', q: { status: 'open', owner: 'none' } },
  { key: 'waiting', label: 'Waiting on payer', q: { status: 'resubmitted' } },
  { key: 'closed', label: 'Closed', q: { status: 'resolved' } },
] as const

export default function Worklist({ selected }: { selected?: number }) {
  const { user } = useAuth()
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('open')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const v = VIEWS.find((x) => x.key === view)!
  const qs = new URLSearchParams({ ...v.q, sort: 'due', page: String(page), ...(q ? { q } : {}) }).toString()
  const list = useApi<List>(`/denials?${qs}`)
  const kpis = useApi<Kpis>('/kpis')
  const look = useApi<Lookups>('/lookups')
  const refresh = () => {
    list.reload()
    kpis.reload()
  }
  const sel = selected ?? list.data?.rows[0]?.id
  const k = kpis.data
  const go = (id: number) => (location.hash = `#/work/${id}`)
  const pick = (key: typeof view) => {
    setView(key)
    setPage(1)
  }

  return (
    <div className="workbench">
      <div className="above-list">
        <div className="kpis">
          <div className="kpi-card"><span>To recover</span><b>{k ? money0(k.openAmount) : '…'}</b><em>{k ? `${k.openCount} open denials` : ''}</em></div>
          <div className="kpi-card"><span>New this week</span><b>{k ? k.newThisWeek.n : '…'}</b><em>{k ? `${money0(k.newThisWeek.amount)} denied` : ''}</em></div>
          <div className="kpi-card"><span>Recovered, last 30 days</span><b className="paid-text">{k ? money0(k.recovered30d) : '…'}</b><em>from resubmissions and appeals</em></div>
          <div className="kpi-card"><span>Average days to resolve</span><b>{k?.avgDaysToResolve ? Math.round(k.avgDaysToResolve) : '—'}</b><em>last 90 days</em></div>
        </div>
      </div>

      <div className="wb-grid">
        <section className="panel wb-list" aria-label="Work queue">
          {k && (k.overdue.n > 0 || k.dueSoon.n > 0) ? (
            <div className="alert-bar in-queue" role="status">
              {k.overdue.n > 0 && <span><b>{k.overdue.n} appeal{k.overdue.n === 1 ? '' : 's'} overdue</b> · {money0(k.overdue.amount)}</span>}
              {k.dueSoon.n > 0 && <span><b>{k.dueSoon.n} due within 14 days</b> · {money0(k.dueSoon.amount)}</span>}
              <button onClick={() => pick('open')}>Show them first</button>
            </div>
          ) : k ? (
            <div className="alert-bar calm in-queue" role="status">No appeal deadlines in the next 14 days.</div>
          ) : null}
          <div className="queue-head">
            <div className="queue-tabs" role="tablist">
              {VIEWS.map((x) => (
                <button key={x.key} role="tab" aria-selected={view === x.key} className={view === x.key ? 'on' : ''} onClick={() => pick(x.key)}>
                  {x.label}{view === x.key && list.data ? <em>{list.data.total}</em> : null}
                </button>
              ))}
            </div>
            <input type="search" className="queue-search" placeholder="Search patient or claim #" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} aria-label="Search" />
          </div>

          <div className="scroll-x queue-table">
            <table className="t queue">
              <thead>
                <tr><th>Patient · payer</th><th>Why it was denied</th><th className="num">Amount</th><th>Appeal deadline</th><th className="col-owner">Owner</th><th>Status</th></tr>
              </thead>
              <tbody>
                {list.data?.rows.map((r) => {
                  const closed = r.status === 'resolved' || r.status === 'written_off'
                  return (
                    <tr key={r.id} className={r.id === sel ? 'sel' : ''} onClick={() => go(r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go(r.id)} aria-selected={r.id === sel}>
                      <td className="who"><b>{titleCase(r.patient)}</b><span>{titleCase(r.payer)}</span></td>
                      <td className="reason"><b>{r.title || 'Denied'}</b> <span className="code-tag">{r.primaryCode}</span></td>
                      <td className="num deny-text">{money(r.amount)}</td>
                      <td><Due iso={r.appealBy} closed={closed} /></td>
                      <td className="col-owner">{r.owner ? <span className="avatar sm" title={r.owner}>{initials(r.owner)}</span> : <span className="small muted">—</span>}</td>
                      <td><StatusPill s={r.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <ul className="queue-cards" aria-label="Denials">
            {list.data?.rows.map((r) => (
              <li key={r.id}>
                <a href={`#/work/${r.id}`}>
                  <span className="row between" style={{ flexWrap: 'nowrap' }}>
                    <b>{titleCase(r.patient)}</b>
                    <b className="deny-text">{money(r.amount)}</b>
                  </span>
                  <span className="small muted">{titleCase(r.payer)}</span>
                  <span className="small">{r.title}</span>
                  <Due iso={r.appealBy} closed={r.status === 'resolved' || r.status === 'written_off'} />
                </a>
              </li>
            ))}
          </ul>
          {list.data && !list.data.rows.length && <div className="empty">Nothing here. Try another view or clear the search.</div>}
          {list.error && <div className="empty">{list.error}</div>}
          {list.data && list.data.total > list.data.pageSize && (
            <div className="pad row between">
              <span className="small muted">{(list.data.page - 1) * list.data.pageSize + 1}–{Math.min(list.data.total, list.data.page * list.data.pageSize)} of {list.data.total}</span>
              <div className="row">
                <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <button className="btn" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </div>
          )}
        </section>

        {sel ? <DetailPanel key={sel} id={sel} users={look.data?.users ?? []} onChange={refresh} mobileOpen={!!selected} /> : <section className="panel wb-detail empty">Pick a denial to work on it.</section>}
      </div>

      {user?.role === 'manager' && k && k.team.length > 0 && (
        <section className="panel pad team above-list" aria-label="Team workload">
          <h2 style={{ fontSize: 16, marginBottom: 6 }}>Team workload</h2>
          {k.team.map((t) => (
            <div key={t.owner} className="team-row">
              <span>{t.owner}</span>
              <div className="track"><div className="fill" style={{ width: `${(100 * t.amount) / Math.max(1, k.team[0].amount)}%` }} /></div>
              <span className="small muted" style={{ textAlign: 'right' }}>{t.open} open</span>
              <b style={{ textAlign: 'right' }}>{money0(t.amount)}</b>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function DetailPanel({ id, users, onChange, mobileOpen }: { id: number; users: Lookups['users']; onChange: () => void; mobileOpen: boolean }) {
  const { user } = useAuth()
  const det = useApi<Detail>(`/denials/${id}`)
  const open = useOpenCode()
  const [note, setNote] = useState('')
  const [modal, setModal] = useState<null | 'resubmit' | 'appeal' | 'resolve'>(null)
  const [err, setErr] = useState('')
  const d = det.data
  useEffect(() => setErr(''), [id])

  const act = async (fn: () => Promise<unknown>) => {
    setErr('')
    try {
      await fn()
      det.reload()
      onChange()
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  if (!d) return <section className={`panel wb-detail ${mobileOpen ? 'm-open' : ''}`}><div className="empty">{det.error ?? 'Loading…'}</div></section>
  const dn = d.denial
  const closed = dn.status === 'resolved' || dn.status === 'written_off'
  const lastSent = [...d.history].reverse().find((h) => h.kind === (dn.status === 'resubmitted' ? 'resubmitted' : 'appeal'))
  const waitingDays = lastSent ? Math.floor((Date.now() - Date.parse(lastSent.at)) / 86400000) : null
  const billed = d.recon.reduce((s, l) => s + l.billed, 0)
  const allowed = d.recon.reduce((s, l) => s + (l.allowed ?? 0), 0)
  const paid = d.recon.reduce((s, l) => s + (l.paid ?? 0), 0)
  const recent = d.history.slice(-4)

  return (
    <section className={`panel wb-detail ${mobileOpen ? 'm-open' : ''}`} aria-label="Denial detail">
      <div className="det-sec">
        <a href="#/work" className="btn ghost m-back">← Work queue</a>
        <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <div>
            <h2>{titleCase(d.claim?.patientName ?? dn.patient ?? '')}</h2>
            <p className="small muted">{titleCase(dn.payer)} · visit {d.claim ? shortDate(d.claim.serviceDate) : '—'}</p>
          </div>
          <StatusPill s={dn.status} />
        </div>
        <div className="det-amount" style={{ marginTop: 10 }}>{money(dn.amount)}</div>
        <div className="facts">
          <div><span>Appeal deadline</span><b><Due iso={dn.appealBy} closed={closed} /></b></div>
          <div><span>Denied on</span><b>{shortDate(dn.deniedOn)}</b></div>
          <div><span>Owner</span><b>{dn.owner ?? 'Unassigned'}</b></div>
        </div>
      </div>

      <div className="det-sec">
        <div className="eyebrow">Why it was denied</div>
        <p className="why"><b>{d.explanation?.title ?? 'Denied'}.</b> {d.explanation?.plain}</p>
        {d.explanation && !closed && dn.status !== 'resubmitted' && dn.status !== 'appealed' && (
          <div className="next"><b>Next step</b>{d.explanation.fix[0]}</div>
        )}
        {(dn.status === 'resubmitted' || dn.status === 'appealed') && (
          <div className="waiting" role="status">
            {dn.status === 'resubmitted' ? 'Corrected claim sent' : 'Appeal sent'}{lastSent ? ` ${shortDate(lastSent.at)}` : ''}{waitingDays !== null ? ` · ${waitingDays} days ago` : ''}. The payer’s next payment for this claim will close it automatically.
          </div>
        )}
        {err && <p className="form-error" role="alert">{err}</p>}
        <div className="actions">
          {closed ? (
            user?.role === 'manager' ? <button className="btn" onClick={() => act(() => api(`/denials/${id}/status`, { method: 'POST', json: { status: 'in_progress' } }))}>Reopen</button> : <span className="small muted">Closed. A manager can reopen it.</span>
          ) : dn.status === 'resubmitted' || dn.status === 'appealed' ? (
            <>
              <button className="btn primary" onClick={() => setModal('resolve')}>Record outcome</button>
              {dn.status === 'resubmitted' && <button className="btn" onClick={() => setModal('appeal')}>Appeal instead</button>}
            </>
          ) : (
            <>
              <button className="btn primary" disabled={!d.claim} onClick={() => setModal('resubmit')}>Fix and resubmit</button>
              <button className="btn" onClick={() => setModal('appeal')}>Write appeal</button>
              <button className="btn" onClick={() => setModal('resolve')}>Close…</button>
            </>
          )}
          {!closed && (
            <label>
              <span className="sr-only">Assign to</span>
              <select value={dn.ownerId ?? ''} onChange={(e) => act(() => api(`/denials/${id}/assign`, { method: 'POST', json: { ownerId: e.target.value ? Number(e.target.value) : null } }))}>
                <option value="">Assign…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      <details className="more">
        <summary>Billed vs paid, line by line</summary>
        <div>
          <div className="scroll-x">
            <table className="t recon cardify">
              <thead><tr><th>Service</th><th className="num">Billed</th><th className="num">Allowed</th><th className="num">Paid</th><th>Codes</th></tr></thead>
              <tbody>
                {d.recon.map((l) => (
                  <tr key={l.lineId}>
                    <td><b className="mono">{l.procedure}{l.modifiers.length ? '-' + l.modifiers.join('-') : ''}</b><div className="small muted one-line" title={PROCEDURES[l.procedure]?.label}>{PROCEDURES[l.procedure]?.label}</div></td>
                    <td className="num" data-label="Billed">{money(l.billed)}</td>
                    <td className="num" data-label="Allowed">{l.allowed === null ? '—' : money(l.allowed)}</td>
                    <td className={`num ${l.paid ? 'paid-text' : 'deny-text'}`} data-label="Paid">{l.missing ? 'not paid' : money(l.paid)}</td>
                    <td data-label="Codes"><div className="row" style={{ gap: 4 }}>{l.adjustments.map((a, i) => <AdjChip key={i} {...a} compact />)}{l.remarks.map((r) => <RemarkChip key={r} code={r} compact />)}</div></td>
                  </tr>
                ))}
                <tr className="total"><td>Total</td><td className="num" data-label="Billed">{money(billed)}</td><td className="num" data-label="Allowed">{money(allowed)}</td><td className="num" data-label="Paid">{money(paid)}</td><td className="hide-sm" /></tr>
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>Click a code for the full explanation.{' '}
            <button className="btn ghost" style={{ minHeight: 0, padding: 0 }} onClick={() => open({ kind: 'carc', code: dn.primaryCode.split('-')[1], group: dn.primaryCode.split('-')[0] })}>About {dn.primaryCode}</button>
          </p>
        </div>
      </details>

      <details className="more">
        <summary>History and notes ({d.history.length})</summary>
        <div>
          <ol className="timeline">
            {recent.map((h) => (
              <li key={h.id} className={`k-${h.kind}`}>
                <span className="t-dot" aria-hidden="true" />
                <div>
                  <span className="small muted">{new Date(h.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> {describe(h, users)}
                  {h.user && <span className="small muted"> · {h.user}</span>}
                  {typeof h.body.text === 'string' && <div className="t-note">{h.body.text}</div>}
                </div>
              </li>
            ))}
          </ol>
          <form
            className="row"
            style={{ marginTop: 10, flexWrap: 'nowrap' }}
            onSubmit={(e) => {
              e.preventDefault()
              if (note.trim()) act(() => api(`/denials/${id}/notes`, { method: 'POST', json: { text: note } }).then(() => setNote('')))
            }}
          >
            <input className="grow" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" maxLength={2000} />
            <button className="btn" type="submit">Add</button>
          </form>
        </div>
      </details>

      {modal === 'resubmit' && <ResubmitModal d={d} onClose={() => setModal(null)} onDone={() => { setModal(null); det.reload(); onChange() }} />}
      {modal === 'appeal' && <AppealModal d={d} onClose={() => setModal(null)} onDone={() => { det.reload(); onChange() }} />}
      {modal === 'resolve' && <ResolveModal d={d} onClose={() => setModal(null)} onDone={() => { setModal(null); det.reload(); onChange() }} />}
    </section>
  )
}

function describe(h: Detail['history'][number], users: Lookups['users']) {
  const b = h.body as Record<string, unknown>
  const who = (id: unknown) => users.find((u) => u.id === id)?.name ?? 'nobody'
  switch (h.kind) {
    case 'submitted': return 'Claim sent to payer'
    case 'remit': return `Payment from ${titleCase(String(b.payer ?? ''))}: ${money(Number(b.paid ?? 0))}`
    case 'denied': return `Denied ${money(Number(b.amount ?? 0))}${b.matched ? '' : ' (claim not found)'}`
    case 'assigned': return b.to ? `Assigned to ${who(b.to)}` : 'Unassigned'
    case 'note': return b.auto ? 'System note' : 'Note'
    case 'resubmitted': return 'Corrected claim sent'
    case 'appeal': return 'Appeal letter written'
    case 'status': return `${STATUS_LABEL[b.from as Status] ?? b.from} → ${STATUS_LABEL[b.to as Status] ?? b.to}${b.recovered ? ` · recovered ${money(Number(b.recovered))}` : ''}${b.auto ? ' (from the next 835)' : ''}`
    default: return h.kind
  }
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between"><h2>{title}</h2><button className="btn ghost" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </>
  )
}

function ResubmitModal({ d, onClose, onDone }: { d: Detail; onClose: () => void; onDone: () => void }) {
  const [mods, setMods] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async () => {
    setBusy(true)
    setErr('')
    try {
      const edits = Object.entries(mods).map(([lineId, m]) => ({ lineId: Number(lineId), modifiers: m.split(/[\s,-]+/).filter(Boolean).map((x) => x.toUpperCase()) }))
      const { x837 } = await api<{ x837: string }>(`/denials/${d.denial.id}/resubmit`, { method: 'POST', json: { edits } })
      download(`${d.claim?.patientControl ?? 'claim'}-corrected.837`, x837)
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Correct & resubmit" onClose={onClose}>
      <p className="muted small" style={{ margin: '6px 0 14px' }}>Creates a corrected claim that replaces the original (payer claim #{d.payment?.payerClaimId}) and downloads it for your clearinghouse. Change modifiers here if the denial was a coding issue.</p>
      <table className="t">
        <thead><tr><th>Line</th><th>Procedure</th><th>Modifiers</th></tr></thead>
        <tbody>
          {d.recon.map((l) => (
            <tr key={l.lineId}>
              <td className="mono">{l.lineNo}</td>
              <td className="mono">{l.procedure}</td>
              <td><input aria-label={`Modifiers for line ${l.lineNo}`} className="mono" style={{ width: 120 }} defaultValue={l.modifiers.join(' ')} onChange={(e) => setMods({ ...mods, [l.lineId]: e.target.value })} placeholder="e.g. 25" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {err && <p className="form-error" role="alert">{err}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Generating…' : 'Generate corrected 837P'}</button>
      </div>
    </Modal>
  )
}

function AppealModal({ d, onClose, onDone }: { d: Detail; onClose: () => void; onDone: () => void }) {
  const [arg, setArg] = useState('')
  const [letter, setLetter] = useState(d.appeal ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const draft = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await api<{ letter: string }>(`/denials/${d.denial.id}/appeal`, { method: 'POST', json: { argument: arg } })
      setLetter(r.letter)
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Draft appeal" onClose={onClose}>
      <label className="field" style={{ marginTop: 10 }}>
        <span>Why should this be paid?</span>
        <textarea rows={3} value={arg} onChange={(e) => setArg(e.target.value)} placeholder="e.g. Authorization A-12345 was approved on 03/01; approval letter attached." maxLength={4000} />
      </label>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={busy} onClick={draft}>{busy ? 'Drafting…' : letter ? 'Redraft' : 'Draft letter'}</button>
        {letter && <button className="btn" onClick={() => navigator.clipboard?.writeText(letter)}>Copy</button>}
        {letter && <button className="btn" onClick={() => download(`appeal-${d.claim?.patientControl ?? d.denial.id}.txt`, letter)}>Download</button>}
      </div>
      {err && <p className="form-error" role="alert">{err}</p>}
      {letter && <pre className="letter">{letter}</pre>}
    </Modal>
  )
}

function ResolveModal({ d, onClose, onDone }: { d: Detail; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'resolved' | 'written_off'>('resolved')
  const [amount, setAmount] = useState(String(d.denial.amount))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const save = async () => {
    setErr('')
    try {
      await api(`/denials/${d.denial.id}/status`, { method: 'POST', json: { status: mode, note: note || undefined, recovered: mode === 'resolved' ? Number(amount) || 0 : undefined } })
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  return (
    <Modal title="Close this denial" onClose={onClose}>
      <div className="row" style={{ margin: '10px 0' }}>
        <button className={`btn ${mode === 'resolved' ? 'primary' : ''}`} onClick={() => setMode('resolved')}>Recovered</button>
        <button className={`btn ${mode === 'written_off' ? 'primary' : ''}`} onClick={() => setMode('written_off')}>Write off</button>
      </div>
      {mode === 'resolved' ? (
        <label className="field"><span>Amount recovered (of {money(d.denial.amount)})</span><input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      ) : (
        <p className="small muted">Write-offs over $500 need a manager. Contractual (CO) denials cannot be billed to the patient.</p>
      )}
      <label className="field" style={{ marginTop: 10 }}><span>Note (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></label>
      {err && <p className="form-error" role="alert">{err}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>Save</button>
      </div>
    </Modal>
  )
}

export const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bPpo\b/, 'PPO')
