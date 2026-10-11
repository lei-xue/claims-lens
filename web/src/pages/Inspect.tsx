import { useMemo, useState } from 'react'
import { AdjChip, RemarkChip } from '../components/CodeDrawer'
import { useCodes } from '../lib/codes'
import { CLAIM_STATUS, PLACE_OF_SERVICE, SEGMENTS } from '../lib/dictionary'
import { DIAGNOSES, PROCEDURES, sample, SAMPLE_SCENARIOS, SCENARIOS } from '../lib/generate'
import { takeHandoff } from '../lib/handoff'
import { interpret, type Remit, type Result, type Submission } from '../lib/interpret'
import { date, money, X12Error } from '../lib/x12'

const DX_BY_CODE = Object.fromEntries(Object.entries(DIAGNOSES).map(([k, v]) => [k.replace('.', ''), { code: k, label: v }]))

export default function Inspect() {
  const [text, setText] = useState(() => takeHandoff() ?? sample('bundled').x835)
  const [view, setView] = useState<'summary' | 'segments'>('summary')
  const [over, setOver] = useState(false)
  const [pick, setPick] = useState('bundled:835')
  const [editing, setEditing] = useState(false)

  const res = useMemo<{ r?: Result; error?: string }>(() => {
    if (!text.trim()) return {}
    try {
      return { r: interpret(text) }
    } catch (e) {
      return { error: e instanceof X12Error ? e.message : `Could not parse: ${(e as Error).message}` }
    }
  }, [text])

  const loadSample = (v: string) => {
    setPick(v)
    const [scenario, kind] = v.split(':')
    const s = sample(scenario)
    setText(kind === '837' ? s.x837 : s.x835)
    setEditing(false)
  }
  const readFile = async (f: File) => {
    setText(await f.text())
    setEditing(false)
  }

  const errors = res.r?.issues.filter((i) => i.level === 'error') ?? []
  const warnings = res.r?.issues.filter((i) => i.level === 'warning') ?? []
  const flagged = new Set(res.r?.issues.map((i) => i.segment).filter((x) => x !== undefined))

  return (
    <>
      <div className="head">
        <div>
          <span className="eyebrow">X12 5010 · 837P claims · 835 remittances</span>
          <h1 style={{ marginTop: 6 }}>Read a claim file like a biller would</h1>
          <p>Paste or drop an 837P or 835. Claims Lens explains every segment, checks that the money balances, and translates each denial code into what happened and what to do next. Everything runs in your browser — nothing is uploaded.</p>
        </div>
      </div>

      <div
        className={`hero-drop ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const f = e.dataTransfer.files[0]
          if (f) readFile(f)
        }}
      >
        <div className="row between" style={{ marginBottom: 10 }}>
          <div className="row">
            <select value={pick} onChange={(e) => loadSample(e.target.value)} aria-label="Load a sample">
              {SAMPLE_SCENARIOS.map((s) => (
                <optgroup key={s} label={SCENARIOS[s].label}>
                  <option value={`${s}:835`}>835 remittance — {SCENARIOS[s].label}</option>
                  <option value={`${s}:837`}>837P claim — {SCENARIOS[s].label}</option>
                </optgroup>
              ))}
            </select>
            <label className="btn">
              Open file…
              <input type="file" hidden accept=".edi,.txt,.x12,.835,.837,text/plain" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
            </label>
            <button className="btn ghost" onClick={() => { setText(''); setEditing(true) }}>Clear</button>
          </div>
          <span className="small muted">Samples are synthetic: fictional patients, provider and payers.</span>
        </div>
        {editing || !text.trim() ? (
          <textarea className="edi" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste an 837P or 835 here — ISA*00*          *00*..." aria-label="EDI text" autoFocus={editing} />
        ) : (
          <button className="source-bar" onClick={() => setEditing(true)}>
            <span className="mono small">{text.trim().slice(0, 64)}…</span>
            <span className="small">{res.r ? `${res.r.segments.length} segments` : ''} · Edit / paste your own</span>
          </button>
        )}
      </div>

      {res.error && <div className="issues err" style={{ marginTop: 16 }}>{res.error}</div>}
      {res.r && (
        <div className="stack" style={{ marginTop: 20 }}>
          {errors.length + warnings.length === 0 ? (
            <div className="issues ok">✓ Structure and balancing checks passed ({res.r.segments.length} segments).</div>
          ) : (
            <div className="issues err">
              <b>{errors.length} error{errors.length === 1 ? '' : 's'}, {warnings.length} warning{warnings.length === 1 ? '' : 's'}</b>
              <ul>
                {res.r.issues.map((i, k) => (
                  <li key={k}>
                    <span className={`pill ${i.level === 'error' ? 'deny' : 'warn'}`}>{i.level}</span> {i.message}
                    {i.segment !== undefined && <span className="mono muted"> (segment {i.segment + 1})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel">
            <div className="seg-tabs">
              <button className={view === 'summary' ? 'on' : ''} onClick={() => setView('summary')}>Plain-English summary</button>
              <button className={view === 'segments' ? 'on' : ''} onClick={() => setView('segments')}>Segments ({res.r.segments.length})</button>
            </div>
            {view === 'summary' ? (
              <div className="pad">
                {res.r.doc?.type === '835' ? <RemitView d={res.r.doc} /> : res.r.doc?.type === '837P' ? <ClaimView d={res.r.doc} /> : <div className="empty">Unsupported transaction — see the Segments tab.</div>}
              </div>
            ) : (
              <SegmentView r={res.r} flagged={flagged} />
            )}
          </div>
        </div>
      )}
    </>
  )
}

function RemitView({ d }: { d: Remit }) {
  const codes = useCodes()
  const totalCharge = d.claims.reduce((a, c) => a + c.charge, 0)
  const totalPr = d.claims.reduce((a, c) => a + c.patientResp, 0)
  const denials = d.claims.flatMap((c) => [...c.adjustments, ...c.services.flatMap((s) => s.adjustments)]).filter((a) => a.group !== 'PR' && !(a.group === 'CO' && a.reason === '45'))
  const byCode = new Map<string, number>()
  for (const a of denials) byCode.set(`${a.group}-${a.reason}`, (byCode.get(`${a.group}-${a.reason}`) ?? 0) + a.amount)
  const top = [...byCode].sort((a, b) => b[1] - a[1])[0]
  const topCarc = top ? codes?.carc.get(top[0].split('-')[1]) : undefined
  const paid = d.claims.reduce((a, c) => a + c.paid, 0)
  return (
    <div className="stack">
      <div className={`verdict ${top ? 'deny' : 'ok'}`}>
        <b>
          {top
            ? `${money(paid)} paid of ${money(totalCharge)} billed — ${money([...byCode.values()].reduce((a, b) => a + b, 0))} denied (${[...byCode.keys()].join(', ')}).`
            : `${money(paid)} paid of ${money(totalCharge)} billed — no denials; the rest is contract write-off and patient share.`}
        </b>
        {top && topCarc && <p>Next step for {top[0]} ({topCarc.title}): {topCarc.fix[0]}</p>}
      </div>
      <div className="grid g4">
        <div className="kpi"><span>Payment</span><b>{money(d.payment)}</b><span>{d.method === 'NON' ? 'No funds moved' : d.method} · {date(d.paymentDate)}</span></div>
        <div className="kpi"><span>Billed</span><b>{money(totalCharge)}</b><span>{d.claims.length} claim{d.claims.length === 1 ? '' : 's'}</span></div>
        <div className="kpi"><span>Patient owes</span><b>{money(totalPr)}</b><span>deductible, coinsurance, copay</span></div>
        <div className="kpi"><span>From</span><b style={{ fontSize: 17, marginTop: 6 }}>{d.payer || '—'}</b><span>to {d.payee || '—'} · trace <span className="mono">{d.trace}</span></span></div>
      </div>
      {d.claims.map((c) => {
        const denied = c.status === '4'
        const claimAdj = c.adjustments
        return (
          <div key={c.segment} className="panel" style={{ overflow: 'hidden' }}>
            <div className="pad row between" style={{ borderBottom: '1px solid var(--line)' }}>
              <div>
                <span className="eyebrow">Claim {c.patientControl} · payer # {c.payerClaim}</span>
                <h3 style={{ marginTop: 4 }}>{c.patient || 'Patient'} <span className="muted mono small">{c.memberId}</span></h3>
              </div>
              <div className="row">
                <span className={`pill ${denied ? 'deny' : c.paid > 0 ? 'paid' : 'warn'}`}>{CLAIM_STATUS[c.status] ?? `Status ${c.status}`}</span>
                <span className="mono">{money(c.paid)} <span className="muted">of {money(c.charge)}</span></span>
              </div>
            </div>
            {claimAdj.length > 0 && (
              <div className="pad row" style={{ borderBottom: '1px solid var(--line)' }}>
                <span className="small muted">Claim-level:</span>
                {claimAdj.map((a, i) => <AdjChip key={i} {...a} />)}
              </div>
            )}
            <div className="scroll-x">
              <table className="t cardify">
                <thead>
                  <tr><th>Service</th><th>Date</th><th className="num">Billed</th><th className="num">Allowed</th><th className="num">Paid</th><th>Adjustments &amp; remarks</th></tr>
                </thead>
                <tbody>
                  {c.services.map((s) => (
                    <tr key={s.segment}>
                      <td>
                        <b className="mono">{s.procedure}</b>
                        {s.modifiers.length > 0 && <span className="mono muted">-{s.modifiers.join('-')}</span>}
                        <div className="small muted">{PROCEDURES[s.procedure]?.label ?? ''}</div>
                      </td>
                      <td className="small" data-label="Date">{s.date ? date(s.date) : '—'}</td>
                      <td className="num" data-label="Billed">{money(s.charge)}</td>
                      <td className="num" data-label="Allowed">{s.allowed !== undefined ? money(s.allowed) : '—'}</td>
                      <td className="num" data-label="Paid" style={{ color: s.paid ? 'var(--paid)' : 'var(--deny)' }}>{money(s.paid)}</td>
                      <td data-label="Why">
                        <div className="row" style={{ gap: 6 }}>
                          {s.adjustments.map((a, i) => <AdjChip key={i} {...a} />)}
                          {s.remarks.map((r) => <RemarkChip key={r} code={r} />)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {c.remarks.length > 0 && (
              <div className="pad row" style={{ borderTop: '1px solid var(--line)' }}>
                <span className="small muted">Claim remarks:</span>
                {c.remarks.map((r) => <RemarkChip key={r} code={r} />)}
              </div>
            )}
          </div>
        )
      })}
      {d.providerAdjustments.length > 0 && (
        <div className="panel pad">
          <h3>Provider-level adjustments (PLB)</h3>
          {d.providerAdjustments.map((p, i) => (
            <div key={i} className="row small" style={{ marginTop: 6 }}><span className="mono">{p.reason}</span> {p.reference} <b className="mono">{money(p.amount)}</b></div>
          ))}
        </div>
      )}
    </div>
  )
}

function ClaimView({ d }: { d: Submission }) {
  return (
    <div className="stack">
      <div className="grid g3">
        <div className="kpi"><span>Billing provider</span><b style={{ fontSize: 17, marginTop: 6 }}>{d.billing.name}</b><span className="mono">NPI {d.billing.npi} · TIN {d.billing.taxId}</span></div>
        <div className="kpi"><span>Claims</span><b>{d.claims.length}</b><span>{money(d.claims.reduce((a, c) => a + c.charge, 0))} billed</span></div>
        <div className="kpi"><span>Submitter</span><b style={{ fontSize: 17, marginTop: 6 }}>{d.submitter}</b><span>837P professional</span></div>
      </div>
      {d.claims.map((c) => (
        <div key={c.segment} className="panel" style={{ overflow: 'hidden' }}>
          <div className="pad row between" style={{ borderBottom: '1px solid var(--line)' }}>
            <div>
              <span className="eyebrow">Claim {c.patientControl} → {c.payer}</span>
              <h3 style={{ marginTop: 4 }}>{c.patient} <span className="muted mono small">{c.memberId}</span></h3>
            </div>
            <div className="row">
              <span className="pill">{PLACE_OF_SERVICE[c.pos] ?? `POS ${c.pos}`}</span>
              <span className="pill">{c.frequency === '1' ? 'Original' : c.frequency === '7' ? 'Replacement' : c.frequency === '8' ? 'Void' : `Freq ${c.frequency}`}</span>
              <b className="mono">{money(c.charge)}</b>
            </div>
          </div>
          <div className="pad">
            <span className="eyebrow">Diagnoses</span>
            <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              {c.diagnoses.map((x, i) => (
                <li key={i}>
                  <b className="mono">{DX_BY_CODE[x.code]?.code ?? x.code}</b> {DX_BY_CODE[x.code]?.label ?? ''} {x.principal && <span className="pill violet">principal</span>}
                </li>
              ))}
            </ol>
          </div>
          <div className="scroll-x">
            <table className="t">
              <thead><tr><th>#</th><th>Service</th><th>Date</th><th>Units</th><th>Dx pointers</th><th className="num">Charge</th></tr></thead>
              <tbody>
                {c.lines.map((l, i) => (
                  <tr key={l.segment}>
                    <td className="mono muted">{i + 1}</td>
                    <td><b className="mono">{l.procedure}</b>{l.modifiers.length > 0 && <span className="mono muted">-{l.modifiers.join('-')}</span>}<div className="small muted">{PROCEDURES[l.procedure]?.label ?? ''}</div></td>
                    <td className="small">{l.date ? date(l.date) : '—'}</td>
                    <td className="mono">{l.units}</td>
                    <td className="mono">{l.pointers.join(', ')}</td>
                    <td className="num">{money(l.charge)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function SegmentView({ r, flagged }: { r: Result; flagged: Set<number | undefined> }) {
  const d = r.delims
  return (
    <div className="segs scroll-x">
      {r.segments.map((s) => {
        const def = SEGMENTS[s.id]
        return (
          <div key={s.index} className={`seg ${flagged.has(s.index) ? 'flag' : ''}`}>
            <span className="n">{s.index + 1}</span>
            <span className="loop" title={r.loops[s.index]}>{r.loops[s.index] ?? ''}</span>
            <span>
              <span className="id" title={def?.name ?? 'Unknown segment'}>{s.id}</span>
              {s.elements.map((e, i) => {
                const label = def?.elements[i]
                const pos = `${s.id}${String(i + 1).padStart(2, '0')}`
                return (
                  <span key={i}>
                    <span className="sep">{d.element}</span>
                    {e && <span className="e" title={`${pos}${label ? ` · ${label}` : ''}`}>{e}</span>}
                  </span>
                )
              })}
              <span className="sep">{d.segment}</span>
              {def && <span className="muted" style={{ fontFamily: 'var(--sans)', marginLeft: 10, fontSize: 12 }}>{def.name}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
