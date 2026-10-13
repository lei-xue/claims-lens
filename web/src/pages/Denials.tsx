import { useOpenCode } from '../components/CodeDrawer'
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
  const months = data.byMonth.slice(-8)

  return (
    <>
      <div className="head">
        <div>
          <h1>Analytics</h1>
          <p>Where denied money comes from and how much the team wins back.</p>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi-card"><span>Denied</span><b>{money0(denied)}</b><em>{data.byReason.reduce((s, r) => s + r.n, 0)} claims</em></div>
        <div className="kpi-card"><span>Recovered</span><b className="paid-text">{money0(recovered)}</b><em>{denied ? `${Math.round((100 * recovered) / denied)}% of denied dollars` : ''}</em></div>
        <div className="kpi-card"><span>Win rate</span><b>{closedN ? `${Math.round((100 * won) / closedN)}%` : '—'}</b><em>closed denials that got paid</em></div>
        <div className="kpi-card"><span>Highest denial rate</span><b>{payers[0] ? `${(100 * payers[0].rate).toFixed(0)}%` : '—'}</b><em>{payers[0] ? titleCase(payers[0].payer) : ''}</em></div>
      </div>

      <div className="grid g2">
        <div className="panel pad">
          <h2 style={{ fontSize: 16 }}>Top reasons for denial</h2>
          <p className="small muted" style={{ margin: '2px 0 12px' }}><span className="key-dot deny" /> denied · <span className="key-dot paid" /> recovered</p>
          {data.byReason.slice(0, 6).map((r) => (
            <div className="hbar" key={r.code}>
              <button className="code-chip" onClick={() => open({ kind: 'carc', code: r.code.split('-')[1], group: r.code.split('-')[0] })} title={`${r.code} · ${r.title}`}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title || r.code}</span>
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
        <div className="panel pad">
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Denial rate by insurer</h2>
          {payers.map((p) => (
            <div className="hbar" key={p.payer}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.payer}>{titleCase(p.payer)}</span>
              <div className="track"><div className="fill" style={{ width: `${(100 * p.rate) / maxRate}%` }} /></div>
              <span className="v">{(100 * p.rate).toFixed(1)}%</span>
            </div>
          ))}
          <h2 style={{ fontSize: 16, margin: '22px 0 4px' }}>Denial rate by month</h2>
          <Trend values={months.map((m) => (m.claims ? m.denied / m.claims : 0))} labels={months.map((m) => new Date(m.month + '-15').toLocaleDateString('en-US', { month: 'short' }))} />
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
