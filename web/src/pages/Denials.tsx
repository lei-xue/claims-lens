import { useOpenCode } from '../components/CodeDrawer'
import { Seg } from '../components/Seg'
import { money0, useApi } from '../lib/api'
import { STATUS_LABEL, titleCase } from './Worklist'

type A = {
  byReason: { code: string; title: string; owner: string; n: number; amount: number; recovered: number }[]
  byPayer: { payer: string; claims: number; denied: number }[]
  byMonth: { month: string; claims: number; denied: number; deniedAmt: number }[]
  byStatus: { status: keyof typeof STATUS_LABEL; n: number; amount: number; recovered: number }[]
  byOwner: { owner: string; open: number; resolved: number; recovered: number }[]
}

export default function Denials() {
  const { data, error } = useApi<A>('/analytics')
  const open = useOpenCode()
  if (!data) return <div className="empty">{error ?? 'Loading…'}</div>
  const denied = data.byReason.reduce((s, r) => s + r.amount, 0)
  const recovered = data.byReason.reduce((s, r) => s + r.recovered, 0)
  const closed = data.byStatus.filter((s) => s.status === 'resolved' || s.status === 'written_off')
  const won = data.byStatus.find((s) => s.status === 'resolved')?.n ?? 0
  const closedN = closed.reduce((s, x) => s + x.n, 0)
  const maxAmt = Math.max(1, ...data.byReason.map((r) => r.amount))
  const payers = data.byPayer.map((p) => ({ ...p, rate: p.claims ? p.denied / p.claims : 0 })).sort((a, b) => b.rate - a.rate)
  const maxRate = Math.max(0.01, ...payers.map((p) => p.rate))
  const owners = new Map<string, number>()
  for (const r of data.byReason) owners.set(r.owner, (owners.get(r.owner) ?? 0) + r.amount)
  const ownerRows = [...owners].sort((a, b) => b[1] - a[1])
  const months = data.byMonth.slice(-8)

  return (
    <>
      <div className="head">
        <div>
          <Seg as="h1" parts={['ANALYTICS', 'DENIALS', money0(denied)]} />
          <p>Where the denied money is, which payers deny most, how much the team wins back, and who can prevent each denial upstream.</p>
        </div>
      </div>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi-card"><span>Denied (all time)</span><b>{money0(denied)}</b><em>{data.byReason.reduce((s, r) => s + r.n, 0)} denials</em></div>
        <div className="kpi-card"><span>Recovered</span><b className="accent">{money0(recovered)}</b><em>{denied ? `${((100 * recovered) / denied).toFixed(0)}% of denied dollars` : ''}</em></div>
        <div className="kpi-card"><span>Win rate</span><b>{closedN ? `${((100 * won) / closedN).toFixed(0)}%` : '—'}</b><em>of closed denials were paid</em></div>
        <div className="kpi-card"><span>Still open</span><b>{money0(data.byStatus.filter((s) => !['resolved', 'written_off'].includes(s.status)).reduce((s, x) => s + x.amount, 0))}</b><em>across {data.byStatus.filter((s) => !['resolved', 'written_off'].includes(s.status)).reduce((s, x) => s + x.n, 0)} claims</em></div>
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="panel pad">
          <h2 style={{ fontSize: 17 }}>Denied dollars by reason</h2>
          <p className="small muted" style={{ margin: '2px 0 12px' }}><span className="key-dot deny" /> denied · <span className="key-dot paid" /> recovered so far. Click a code for the fix.</p>
          {data.byReason.map((r) => (
            <div className="hbar" key={r.code}>
              <button className="code-chip" onClick={() => open({ kind: 'carc', code: r.code.split('-')[1], group: r.code.split('-')[0] })} title={r.title}>
                <b>{r.code}</b> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
              </button>
              <div className="track" title={`${money0(r.recovered)} recovered of ${money0(r.amount)}`}>
                <div className="fill deny" style={{ width: `${(100 * r.amount) / maxAmt}%`, position: 'relative' }}>
                  <div className="fill" style={{ width: `${r.amount ? (100 * r.recovered) / r.amount : 0}%`, background: 'var(--paid)' }} />
                </div>
              </div>
              <span className="v">{money0(r.amount)}</span>
            </div>
          ))}
        </div>
        <div className="stack">
          <div className="panel pad">
            <h2 style={{ fontSize: 17, marginBottom: 10 }}>Denial rate by payer</h2>
            {payers.map((p) => (
              <div className="hbar" key={p.payer}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.payer}>{titleCase(p.payer)}</span>
                <div className="track"><div className="fill" style={{ width: `${(100 * p.rate) / maxRate}%` }} /></div>
                <span className="v">{(100 * p.rate).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div className="panel pad">
            <h2 style={{ fontSize: 17 }}>Monthly denial rate</h2>
            <Trend values={months.map((m) => (m.claims ? m.denied / m.claims : 0))} labels={months.map((m) => new Date(m.month + '-15').toLocaleDateString('en-US', { month: 'short' }))} />
          </div>
        </div>
      </div>

      <div className="grid g2">
        <div className="panel pad">
          <h2 style={{ fontSize: 17 }}>Who can prevent them</h2>
          <p className="small muted" style={{ margin: '2px 0 12px' }}>Denied dollars by the team that usually owns the root cause.</p>
          {ownerRows.map(([k, v]) => (
            <div className="hbar" key={k}>
              <span style={{ textTransform: 'capitalize' }}>{k}</span>
              <div className="track"><div className="fill" style={{ width: `${(100 * v) / Math.max(1, ownerRows[0][1])}%` }} /></div>
              <span className="v">{money0(v)}</span>
            </div>
          ))}
        </div>
        <div className="panel pad">
          <h2 style={{ fontSize: 17 }}>Team</h2>
          <table className="t" style={{ marginTop: 8 }}>
            <thead><tr><th>Biller</th><th className="num">Open</th><th className="num">Resolved</th><th className="num">Recovered</th></tr></thead>
            <tbody>
              {data.byOwner.map((o) => (
                <tr key={o.owner}><td>{o.owner}</td><td className="num">{o.open}</td><td className="num">{o.resolved}</td><td className="num">{money0(o.recovered)}</td></tr>
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
  const x = (i: number) => 34 + (i * (w - 54)) / Math.max(1, values.length - 1)
  const y = (v: number) => h - 26 - (v / max) * (h - 42)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Monthly denial rate">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={34} x2={w - 20} y1={y((max * f) / 1.15)} y2={y((max * f) / 1.15)} stroke="var(--line)" />
          <text x={0} y={y((max * f) / 1.15) + 4} fontSize="12" fill="var(--muted)">{Math.round((100 * max * f) / 1.15)}%</text>
        </g>
      ))}
      <path d={values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r="4" fill="var(--panel)" stroke="var(--accent)" strokeWidth="2"><title>{`${labels[i]}: ${(100 * v).toFixed(1)}%`}</title></circle>
          <text x={x(i)} y={h - 6} fontSize="12" textAnchor="middle" fill="var(--muted)">{labels[i]}</text>
        </g>
      ))}
    </svg>
  )
}
