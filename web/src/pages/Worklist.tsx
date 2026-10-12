import { useEffect, useState } from 'react'
import { AdjChip, RemarkChip, useOpenCode } from '../components/CodeDrawer'
import { CountUp } from '../components/CountUp'
import { Seg } from '../components/Seg'
import { api, download, initials, money, money0, shortDate, useApi, useAuth } from '../lib/api'
import { CATEGORY_LABEL } from '../lib/codes'
import { PROCEDURES } from '../lib/generate'

type Row = {
  id: number; status: Status; primaryCode: string; title: string; codes: string[]; category: string; amount: number; recovered: number
  deniedOn: string; appealBy: string; age: number; patientControl: string; patient: string; serviceDate: string; payer: string; owner: string | null; ownerId: number | null
}
type Status = 'new' | 'in_progress' | 'resubmitted' | 'appealed' | 'resolved' | 'written_off'
type List = { rows: Row[]; total: number; amount: number; page: number; pageSize: number }
type Kpis = { openCount: number; openAmount: number; recovered30d: number; avgDaysToResolve: number | null; denialRate90d: number; appealDeadlineSoon: number }
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
  new: 'New', in_progress: 'In progress', resubmitted: 'Resubmitted', appealed: 'Appealed', resolved: 'Resolved', written_off: 'Written off',
}
const STATUS_TONE: Record<Status, string> = { new: '', in_progress: 'paid', resubmitted: 'info', appealed: 'warn', resolved: 'paid solid', written_off: 'deny' }
export const StatusPill = ({ s }: { s: Status }) => <span className={`pill status ${STATUS_TONE[s]}`}>{STATUS_LABEL[s]}</span>

const FILTER_LABEL: Record<string, string> = { status: 'Status', payer: 'Payer', category: 'Category', owner: 'Owner', age: 'Age' }

export default function Worklist({ selected }: { selected?: number }) {
  const [f, setF] = useState({ status: 'open', payer: '', category: '', owner: '', age: '', q: '', sort: 'age', page: 1 })
  const [showFilters, setShowFilters] = useState(false)
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => [k, String(v)])).toString()
  const list = useApi<List>(`/denials?${qs}`)
  const kpis = useApi<Kpis>('/kpis')
  const look = useApi<Lookups>('/lookups')
  const set = (k: keyof typeof f, v: string | number) => setF({ ...f, [k]: v, page: k === 'page' ? Number(v) : 1 })
  const refresh = () => {
    list.reload()
    kpis.reload()
  }
  const sel = selected ?? list.data?.rows[0]?.id
  const k = kpis.data
  const go = (id: number) => (location.hash = `#/work/${id}`)

  // human labels for the active filter chips
  const chipText = (key: string, v: string) => {
    if (key === 'status') return v === 'all' ? 'Everything' : STATUS_LABEL[v as Status] ?? v
    if (key === 'payer') return titleCase(look.data?.payers.find((p) => String(p.id) === v)?.name ?? v)
    if (key === 'category') return CATEGORY_LABEL[v] ?? v
    if (key === 'owner') return v === 'me' ? 'Me' : v === 'none' ? 'Unassigned' : look.data?.users.find((u) => String(u.id) === v)?.name ?? v
    if (key === 'age') return `${v} days`
    return v
  }
  const active = (['status', 'payer', 'category', 'owner', 'age'] as const).filter((key) => f[key] && !(key === 'status' && f.status === 'open'))

  return (
    <div className="workbench">
      <div className="kpi-line" aria-label="Key numbers">
        <span className="seg-id">KPI</span>
        <span className="kv"><em>open</em><b className="deny-text">{k ? <CountUp value={k.openAmount} format={money0} /> : '…'}</b><em>{k ? `${k.openCount} claims` : ''}</em></span>
        <span className="kv"><em>recovered 30d</em><b className="accent">{k ? <CountUp value={k.recovered30d} format={money0} /> : '…'}</b></span>
        <span className="kv"><em>avg days to resolve</em><b>{k?.avgDaysToResolve ? k.avgDaysToResolve.toFixed(1) : '—'}</b></span>
        <span className="kv"><em>denial rate</em><b>{k ? `${(k.denialRate90d * 100).toFixed(1)}%` : '…'}</b></span>
        {k && k.appealDeadlineSoon > 0 && <span className="kv"><em>deadlines ≤14d</em><b className="warn-text">{k.appealDeadlineSoon}</b></span>}
        <span className="seg-sep">~</span>
      </div>

      <div className="wb-grid">
        <section className="panel wb-list" aria-label="Denial worklist">
          <div className="pad" style={{ paddingBottom: 10 }}>
            <div className="row between" style={{ alignItems: 'flex-end' }}>
              <div>
                <Seg as="h1" parts={['WORKLIST', f.status === 'open' ? 'OPEN' : chipText('status', f.status).toUpperCase(), list.data ? money(list.data.amount) : '…']} />
                <p className="small muted" style={{ marginTop: 4 }}>{list.data ? `${list.data.total} claims · sorted by ${f.sort === 'age' ? 'oldest first' : f.sort === 'amount' ? 'largest first' : 'appeal deadline'}` : 'Loading…'}</p>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <input type="search" placeholder="Claim, patient or code" value={f.q} onChange={(e) => set('q', e.target.value)} aria-label="Search" className="wl-search" />
                <button className={`btn ${showFilters || active.length ? 'on' : ''}`} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
                  Filters{active.length ? ` · ${active.length}` : ''}
                </button>
              </div>
            </div>
            {active.length > 0 && (
              <div className="row chips" style={{ marginTop: 10 }}>
                {active.map((key) => (
                  <button key={key} className="fchip" onClick={() => set(key, key === 'status' ? 'open' : '')} aria-label={`Remove ${FILTER_LABEL[key]} filter`}>
                    <em>{FILTER_LABEL[key]}</em> {chipText(key, String(f[key]))} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
            {showFilters && (
              <div className="filters">
                <label><span>Status</span>
                  <select value={f.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="open">Open (all)</option>
                    {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    <option value="all">Everything</option>
                  </select>
                </label>
                <label><span>Payer</span>
                  <select value={f.payer} onChange={(e) => set('payer', e.target.value)}>
                    <option value="">All</option>
                    {look.data?.payers.map((p) => <option key={p.id} value={p.id}>{titleCase(p.name)}</option>)}
                  </select>
                </label>
                <label><span>Category</span>
                  <select value={f.category} onChange={(e) => set('category', e.target.value)}>
                    <option value="">All</option>
                    {look.data?.categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</option>)}
                  </select>
                </label>
                <label><span>Owner</span>
                  <select value={f.owner} onChange={(e) => set('owner', e.target.value)}>
                    <option value="">Anyone</option>
                    <option value="me">Me</option>
                    <option value="none">Unassigned</option>
                    {look.data?.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </label>
                <label><span>Age</span>
                  <select value={f.age} onChange={(e) => set('age', e.target.value)}>
                    <option value="">Any</option>
                    <option value="0-30">0–30 days</option>
                    <option value="31-60">31–60 days</option>
                    <option value="61-90">61–90 days</option>
                    <option value="90+">90+ days</option>
                  </select>
                </label>
                <label><span>Sort</span>
                  <select value={f.sort} onChange={(e) => set('sort', e.target.value)}>
                    <option value="age">Oldest first</option>
                    <option value="amount">Largest first</option>
                    <option value="appealBy">Appeal deadline</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          <div className="scroll-x wl-table">
          <table className="t wl">
            <thead>
              <tr><th>Claim · patient · payer</th><th>Denial</th><th className="num">Denied</th><th className="num">Age</th><th className="col-owner">Owner</th><th>Status</th></tr>
            </thead>
            <tbody>
              {list.data?.rows.map((r) => (
                <tr key={r.id} className={r.id === sel ? 'sel' : ''} onClick={() => go(r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go(r.id)} aria-selected={r.id === sel}>
                  <td><b className="mono">{r.patientControl}</b><div className="small muted payer-cell" title={`${r.patient} · ${titleCase(r.payer)}`}>{r.patient} · {titleCase(r.payer)}</div></td>
                  <td><span className="code-tag">{r.primaryCode}</span><div className="small muted clamp">{r.title}</div></td>
                  <td className="num deny-text">{money(r.amount)}</td>
                  <td className="num mono">{r.age}d</td>
                  <td className="col-owner">{r.owner ? <span className="avatar sm" title={r.owner}>{initials(r.owner)}</span> : <span className="small muted">—</span>}</td>
                  <td><StatusPill s={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <ul className="wl-cards" aria-label="Denials">
            {list.data?.rows.map((r) => (
              <li key={r.id}>
                <a href={`#/work/${r.id}`} className={r.id === sel ? 'sel' : ''}>
                  <span className="row between" style={{ flexWrap: 'nowrap' }}>
                    <b className="mono">{r.patientControl}</b>
                    <b className="mono deny-text">{money(r.amount)}</b>
                  </span>
                  <span className="small muted">{r.patient} · {titleCase(r.payer)}</span>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="code-tag">{r.primaryCode}</span>
                    <span className="small">{r.title}</span>
                  </span>
                  <span className="row between">
                    <StatusPill s={r.status} />
                    <span className="small muted mono">{r.age}d{r.owner ? ` · ${r.owner}` : ''}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {list.data && !list.data.rows.length && <div className="empty">No denials match. Remove a filter or clear the search.</div>}
          {list.error && <div className="empty">{list.error}</div>}
          {list.data && list.data.total > list.data.pageSize && (
            <div className="pad row between">
              <span className="small muted">{(list.data.page - 1) * list.data.pageSize + 1}–{Math.min(list.data.total, list.data.page * list.data.pageSize)} of {list.data.total}</span>
              <div className="row">
                <button className="btn" disabled={f.page <= 1} onClick={() => set('page', f.page - 1)}>Previous</button>
                <button className="btn" disabled={f.page * list.data.pageSize >= list.data.total} onClick={() => set('page', f.page + 1)}>Next</button>
              </div>
            </div>
          )}
        </section>

        {sel ? <DetailPanel key={sel} id={sel} users={look.data?.users ?? []} onChange={refresh} mobileOpen={!!selected} /> : <section className="panel wb-detail empty">Select a denial to work it.</section>}
      </div>
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
  const daysLeft = Math.ceil((Date.parse(dn.appealBy) - Date.now()) / 86400000)
  const lastSent = [...d.history].reverse().find((h) => h.kind === (dn.status === 'resubmitted' ? 'resubmitted' : 'appeal'))
  const waiting = dn.status === 'resubmitted' || dn.status === 'appealed' ? { at: lastSent?.at ?? null, days: lastSent ? Math.floor((Date.now() - Date.parse(lastSent.at)) / 86400000) : null } : null
  const billed = d.recon.reduce((s, l) => s + l.billed, 0)
  const allowed = d.recon.reduce((s, l) => s + (l.allowed ?? 0), 0)
  const paid = d.recon.reduce((s, l) => s + (l.paid ?? 0), 0)

  return (
    <section className={`panel wb-detail ${mobileOpen ? 'm-open' : ''}`} aria-label="Denial detail">
      <div className="pad det-head">
        <a href="#/work" className="btn ghost m-back">← Worklist</a>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2 className="mono" style={{ fontSize: 22 }}>{d.claim?.patientControl ?? dn.patientControl}</h2>
            <p className="muted small">{d.claim?.patientName} · {titleCase(dn.payer)} · DOS {d.claim ? shortDate(d.claim.serviceDate) : '—'}</p>
          </div>
          <StatusPill s={dn.status} />
        </div>
        <div className="row small" style={{ marginTop: 10, gap: 14 }}>
          <span className="muted">Denied <b className="ink">{shortDate(dn.deniedOn)}</b></span>
          <span className={daysLeft < 14 && !closed ? 'warn-text' : 'muted'}>Appeal by <b>{shortDate(dn.appealBy)}</b>{!closed && (daysLeft < 0 ? ` · overdue ${-daysLeft}d` : ` · ${daysLeft}d left`)}</span>
          <span className="muted">Owner <b className="ink">{dn.owner ?? 'unassigned'}</b></span>
        </div>
      </div>

      <div className="pad det-sec">
        <Seg as="h2" parts={['RECON', '837', '835']} />
        <p className="small muted">What you billed vs what the payer did {d.payment ? `· trace ${d.payment.trace} · ${shortDate(d.payment.paymentDate)}` : ''}</p>
        <div className="scroll-x" style={{ marginTop: 10 }}>
          <table className="t recon cardify">
            <thead><tr><th>CPT</th><th className="num">Billed</th><th className="num">Allowed</th><th className="num">Paid</th><th>Adj.</th></tr></thead>
            <tbody>
              {d.recon.map((l) => (
                <tr key={l.lineNo}>
                  <td><b className="mono">{l.procedure}{l.modifiers.length ? '-' + l.modifiers.join('-') : ''}</b><div className="small muted hide-sm one-line" title={PROCEDURES[l.procedure]?.label}>{PROCEDURES[l.procedure]?.label}</div></td>
                  <td className="num" data-label="Billed">{money(l.billed)}</td>
                  <td className="num" data-label="Allowed">{l.allowed === null ? '—' : money(l.allowed)}</td>
                  <td className={`num ${l.paid ? 'paid-text' : 'deny-text'}`} data-label="Paid">{l.missing ? 'not on 835' : money(l.paid)}</td>
                  <td data-label="Adj."><div className="row" style={{ gap: 4 }}>{l.adjustments.map((a, i) => <AdjChip key={i} {...a} compact />)}{l.remarks.map((r) => <RemarkChip key={r} code={r} compact />)}</div></td>
                </tr>
              ))}
              <tr className="total"><td>Total</td><td className="num" data-label="Billed">{money(billed)}</td><td className="num" data-label="Allowed">{money(allowed)}</td><td className="num" data-label="Paid">{money(paid)}</td><td className="hide-sm" /></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ textAlign: 'right', marginTop: 6 }}>{money(dn.amount)} denied · {money(paid)} paid{dn.recovered ? ` · ${money(dn.recovered)} recovered` : ''}</p>
      </div>

      <div className="pad det-sec">
        <h3>
          <button className="code-tag as-btn" onClick={() => open({ kind: 'carc', code: dn.primaryCode.split('-')[1], group: dn.primaryCode.split('-')[0] })}>{dn.primaryCode}</button>{' '}
          {d.explanation?.title}
        </h3>
        {d.explanation && (
          <dl className="explain">
            <dt>What happened</dt><dd>{d.explanation.plain}</dd>
            <dt>Likely cause</dt><dd>{d.explanation.causes?.[0]}</dd>
            <dt>What to do</dt><dd><ol>{d.explanation.fix.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ol></dd>
          </dl>
        )}
        {waiting && (
          <div className="waiting" role="status">
            <b>{dn.status === 'resubmitted' ? 'Corrected claim sent' : 'Appeal sent'} {waiting.at ? shortDate(waiting.at) : ''}</b>
            <span>
              Waiting on {titleCase(dn.payer)} — {dn.status === 'resubmitted' ? 'replacement claims usually pay within 14–30 days' : 'appeal decisions usually take 30–60 days'}
              {waiting.days !== null ? ` (${waiting.days} days so far)` : ''}. The next 835 for this claim will close it automatically.
            </span>
          </div>
        )}
        {err && <p className="form-error" role="alert">{err}</p>}
        <div className="actions">
          <label className="assign">
            <span className="sr-only">Assign to</span>
            <select value={dn.ownerId ?? ''} disabled={closed} onChange={(e) => act(() => api(`/denials/${id}/assign`, { method: 'POST', json: { ownerId: e.target.value ? Number(e.target.value) : null } }))}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          {closed ? (
            user?.role === 'manager' ? <button className="btn" onClick={() => act(() => api(`/denials/${id}/status`, { method: 'POST', json: { status: 'in_progress' } }))}>Reopen</button> : <span className="small muted closed-note">Closed — a manager can reopen it.</span>
          ) : dn.status === 'resubmitted' ? (
            <>
              <button className="btn primary" onClick={() => setModal('resolve')}>Record payment…</button>
              <button className="btn" onClick={() => setModal('appeal')}>Appeal instead</button>
            </>
          ) : dn.status === 'appealed' ? (
            <>
              <button className="btn primary" onClick={() => setModal('resolve')}>Record decision…</button>
              <button className="btn" onClick={() => setModal('appeal')}>Edit appeal</button>
            </>
          ) : (
            <>
              <button className="btn primary" disabled={!d.claim} onClick={() => setModal('resubmit')}>Correct &amp; resubmit</button>
              <button className="btn" onClick={() => setModal('appeal')}>Draft appeal</button>
              <button className="btn" onClick={() => setModal('resolve')}>Resolve…</button>
            </>
          )}
        </div>
      </div>

      <div className="pad det-sec">
        <Seg as="h2" parts={['ACTIVITY', d.history.length]} />
        <ol className="timeline">
          {d.history.map((h) => (
            <li key={h.id} className={`k-${h.kind}`}>
              <span className="t-dot" aria-hidden="true" />
              <div>
                <span className="small muted">{new Date(h.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>{' '}
                <span>{describe(h, users)}</span>
                {h.user && <span className="small muted"> · {h.user}</span>}
                {typeof h.body.text === 'string' && <div className="t-note">{h.body.text}</div>}
              </div>
            </li>
          ))}
        </ol>
        <form
          className="row"
          style={{ marginTop: 12, flexWrap: 'nowrap' }}
          onSubmit={(e) => {
            e.preventDefault()
            if (note.trim()) act(() => api(`/denials/${id}/notes`, { method: 'POST', json: { text: note } })).then(() => setNote(''))
          }}
        >
          <input className="grow" placeholder="Add a note (call reference, what you checked…)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" maxLength={2000} />
          <button className="btn" type="submit" disabled={!note.trim()}>Add</button>
        </form>
      </div>

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
    case 'submitted': return '837P claim submitted'
    case 'remit': return `835 received from ${titleCase(String(b.payer ?? ''))} — paid ${money(Number(b.paid ?? 0))}`
    case 'denied': return `Denied ${(b.codes as string[] | undefined)?.join(', ') ?? ''} — ${money(Number(b.amount ?? 0))}${b.matched ? ', auto-matched to the 837' : ' (no matching 837)'}`
    case 'assigned': return b.to ? `Assigned to ${who(b.to)}` : 'Unassigned'
    case 'note': return b.auto ? 'System note' : 'Note'
    case 'resubmitted': return 'Corrected claim (frequency 7) generated and resubmitted'
    case 'appeal': return 'Appeal letter drafted'
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
      <p className="muted small" style={{ margin: '6px 0 14px' }}>Generates a replacement claim (CLM05-3 = 7) that references the payer claim number {d.payment?.payerClaimId} in REF*F8, and downloads it. Adjust modifiers if the denial was coding-related.</p>
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
