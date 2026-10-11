import { useMemo, useState } from 'react'
import { useOpenCode } from '../components/CodeDrawer'
import { useCodes } from '../lib/codes'
import { dataset, PAYERS, to835, type SynthClaim } from '../lib/generate'
import { sendToInspector } from '../lib/handoff'
import { money } from '../lib/x12'

type Denial = { claim: SynthClaim; reason: string; group: string; amount: number }

function denialsOf(c: SynthClaim): Denial[] {
  const out: Denial[] = []
  c.outcome.lines.forEach((l) => {
    for (const a of l.adj) if (!(a.group === 'CO' && a.reason === '45') && a.group !== 'PR') out.push({ claim: c, reason: a.reason, group: a.group, amount: a.amount })
  })
  return out
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']

export default function Denials() {
  const claims = useMemo(() => dataset(1500), [])
  const codes = useCodes()
  const open = useOpenCode()
  const [payer, setPayer] = useState('all')

  const view = payer === 'all' ? claims : claims.filter((c) => c.payer.id === payer)
  const denials = view.flatMap(denialsOf)
  const deniedClaims = new Set(denials.map((d) => d.claim.id))
  const billed = view.reduce((a, c) => a + c.charge, 0)
  const deniedAmt = denials.reduce((a, d) => a + d.amount, 0)
  const paid = view.reduce((a, c) => a + c.outcome.lines.reduce((b, l) => b + l.paid, 0), 0)
  const days = view.reduce((a, c) => a + daysBetween(c.serviceDate, c.paidDate), 0) / (view.length || 1)

  const byReason = group(denials, (d) => `${d.group}-${d.reason}`)
  const reasonRows = [...byReason].map(([k, ds]) => ({ k, group: ds[0].group, reason: ds[0].reason, n: new Set(ds.map((d) => d.claim.id)).size, amt: ds.reduce((a, d) => a + d.amount, 0) })).sort((a, b) => b.amt - a.amt)
  const maxAmt = Math.max(1, ...reasonRows.map((r) => r.amt))

  const payerRows = PAYERS.map((p) => {
    const cs = claims.filter((c) => c.payer.id === p.id)
    const d = new Set(cs.flatMap(denialsOf).map((x) => x.claim.id)).size
    return { p, n: cs.length, rate: cs.length ? d / cs.length : 0 }
  }).sort((a, b) => b.rate - a.rate)
  const maxRate = Math.max(0.01, ...payerRows.map((r) => r.rate))

  const owner = group(denials, (d) => codes?.carc.get(d.reason)?.owner ?? 'other')
  const ownerRows = [...owner].map(([k, ds]) => ({ k, amt: ds.reduce((a, d) => a + d.amount, 0), n: ds.length })).sort((a, b) => b.amt - a.amt)

  const trend = MONTHS.map((_, m) => {
    const cs = view.filter((c) => Number(c.serviceDate.slice(4, 6)) === m + 1)
    const d = cs.filter((c) => deniedClaims.has(c.id)).length
    return cs.length ? d / cs.length : 0
  })

  const worklist = [...group(denials, (d) => d.claim.id)].map(([, ds]) => ({ claim: ds[0].claim, amt: ds.reduce((a, d) => a + d.amount, 0), reasons: [...new Set(ds.map((d) => `${d.group}-${d.reason}`))] })).sort((a, b) => b.claim.serviceDate.localeCompare(a.claim.serviceDate) || b.amt - a.amt).slice(0, 15)

  return (
    <>
      <div className="head">
        <div>
          <span className="eyebrow">Demo dataset · 1,500 synthetic claims · Jan–Sep 2026</span>
          <h1 style={{ marginTop: 6 }}>Denial analytics</h1>
          <p>What a revenue-cycle team looks at every week: which denials cost the most, which payers deny most often, and who on the team can prevent them. Click any code for the fix.</p>
        </div>
        <select value={payer} onChange={(e) => setPayer(e.target.value)} aria-label="Payer">
          <option value="all">All payers</option>
          {PAYERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="grid g5" style={{ marginBottom: 16 }}>
        <div className="panel pad kpi"><span>Claims</span><b>{view.length.toLocaleString()}</b><span>{money(billed)} billed</span></div>
        <div className="panel pad kpi"><span>Denial rate</span><b style={{ color: 'var(--deny)' }}>{pct(deniedClaims.size / view.length)}</b><span>claims with ≥1 denied line</span></div>
        <div className="panel pad kpi"><span>Denied dollars</span><b>{money(deniedAmt)}</b><span>{pct(deniedAmt / billed)} of billed</span></div>
        <div className="panel pad kpi"><span>Collected from payers</span><b>{money(paid)}</b><span>{pct(paid / billed)} of billed</span></div>
        <div className="panel pad kpi"><span>Days to payment</span><b>{days.toFixed(1)}</b><span>service → remittance</span></div>
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="panel pad">
          <h2 style={{ fontSize: 17 }}>Denied dollars by reason</h2>
          <p className="small muted" style={{ margin: '2px 0 12px' }}>Excludes routine contractual write-offs (CO-45) and patient cost-sharing.</p>
          {reasonRows.map((r) => (
            <div className="hbar" key={r.k}>
              <button className={`code-chip ${r.group.toLowerCase()}`} onClick={() => open({ kind: 'carc', code: r.reason, group: r.group })} title={codes?.carc.get(r.reason)?.plain} style={{ overflow: 'hidden' }}>
                <b>{r.k}</b> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{codes?.carc.get(r.reason)?.title ?? ''}</span>
              </button>
              <div className="track"><div className="fill deny" style={{ width: `${(100 * r.amt) / maxAmt}%` }} /></div>
              <span className="v">{money(r.amt).replace('.00', '')}</span>
            </div>
          ))}
        </div>
        <div className="stack">
          <div className="panel pad">
            <h2 style={{ fontSize: 17, marginBottom: 10 }}>Denial rate by payer</h2>
            {payerRows.map((r) => (
              <div className="hbar" key={r.p.id}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.p.name}>{titleCase(r.p.name)}</span>
                <div className="track"><div className="fill" style={{ width: `${(100 * r.rate) / maxRate}%` }} /></div>
                <span className="v">{pct(r.rate)}</span>
              </div>
            ))}
          </div>
          <div className="panel pad">
            <h2 style={{ fontSize: 17 }}>Monthly denial rate</h2>
            <Trend values={trend} labels={MONTHS} />
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="panel pad">
          <h2 style={{ fontSize: 17 }}>Who can prevent them</h2>
          <p className="small muted" style={{ margin: '2px 0 12px' }}>Denied dollars grouped by the team that usually owns the fix.</p>
          {ownerRows.map((r) => (
            <div className="hbar" key={r.k}>
              <span style={{ textTransform: 'capitalize' }}>{r.k}</span>
              <div className="track"><div className="fill" style={{ width: `${(100 * r.amt) / Math.max(1, ownerRows[0]?.amt ?? 1)}%` }} /></div>
              <span className="v">{money(r.amt).replace('.00', '')}</span>
            </div>
          ))}
        </div>
        <div className="panel pad">
          <h2 style={{ fontSize: 17 }}>How to read this</h2>
          <ul className="small" style={{ paddingLeft: 18, margin: '8px 0 0' }}>
            <li><b>CO</b> denials are write-offs unless fixed and resubmitted or appealed — that is where the money is.</li>
            <li>Front-desk causes (eligibility, authorization, wrong payer) are the cheapest to prevent: check them before the visit.</li>
            <li>Coding denials (modifiers, bundling) usually mean a corrected claim, not an appeal.</li>
            <li>The data is generated: payer strictness and scenario weights are made up, so the shape is realistic but the numbers are not benchmarks.</li>
          </ul>
        </div>
      </div>

      <div className="panel">
        <div className="pad"><h2 style={{ fontSize: 17 }}>Worklist: newest denials</h2></div>
        <div className="scroll-x">
          <table className="t">
            <thead><tr><th>Claim</th><th>Payer</th><th>Service date</th><th>Reasons</th><th className="num">Denied</th><th /></tr></thead>
            <tbody>
              {worklist.map((w) => (
                <tr key={w.claim.id}>
                  <td className="mono">{w.claim.id}</td>
                  <td>{titleCase(w.claim.payer.name)}</td>
                  <td className="mono small">{w.claim.serviceDate.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3')}</td>
                  <td><div className="row" style={{ gap: 6 }}>{w.reasons.map((r) => <span key={r} className="pill deny mono">{r}</span>)}</div></td>
                  <td className="num">{money(w.amt)}</td>
                  <td><button className="btn small" onClick={() => sendToInspector(to835([w.claim]))}>Open 835 →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Trend({ values, labels }: { values: number[]; labels: string[] }) {
  const w = 520
  const h = 150
  const max = Math.max(0.05, ...values) * 1.15
  const x = (i: number) => 30 + (i * (w - 50)) / (values.length - 1)
  const y = (v: number) => h - 24 - (v / max) * (h - 40)
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Monthly denial rate">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={30} x2={w - 20} y1={y(max * f / 1.15)} y2={y(max * f / 1.15)} stroke="var(--line)" />
          <text x={0} y={y(max * f / 1.15) + 4} fontSize="10" fill="var(--muted)">{Math.round((100 * max * f) / 1.15)}%</text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--violet)" strokeWidth="2.5" strokeLinejoin="round" />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r="3.5" fill="var(--panel)" stroke="var(--violet)" strokeWidth="2">
            <title>{`${labels[i]}: ${(100 * v).toFixed(1)}%`}</title>
          </circle>
          <text x={x(i)} y={h - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">{labels[i]}</text>
        </g>
      ))}
    </svg>
  )
}

function group<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>()
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x])
  return m
}
const pct = (x: number) => `${(100 * x).toFixed(1)}%`
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace('Ppo', 'PPO')
function daysBetween(a: string, b: string) {
  const d = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))).getTime()
  return (d(b) - d(a)) / 86400000
}
