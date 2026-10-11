import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { CATEGORY_LABEL, useCodes, type Carc, type Rarc } from '../lib/codes'
import { GROUP_CODES } from '../lib/dictionary'

type Open = { kind: 'carc' | 'rarc'; code: string; group?: string } | null
const Ctx = createContext<(o: Open) => void>(() => {})
export const useOpenCode = () => useContext(Ctx)

export function CodeDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null)
  const codes = useCodes()
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  const item = open && codes ? (open.kind === 'carc' ? codes.carc.get(open.code) : codes.rarc.get(open.code)) : undefined
  return (
    <Ctx.Provider value={setOpen}>
      {children}
      {open && (
        <>
          <div className="drawer-bg" onClick={() => setOpen(null)} />
          <aside className="drawer" role="dialog" aria-label={`${open.kind.toUpperCase()} ${open.code}`}>
            <div className="row between">
              <span className="eyebrow">{open.kind === 'carc' ? 'Claim adjustment reason code' : 'Remittance advice remark code'}</span>
              <button className="btn ghost" onClick={() => setOpen(null)} aria-label="Close">✕</button>
            </div>
            <h2 style={{ marginTop: 8 }}>
              <span className="mono">{open.group ? `${open.group}-` : ''}{open.code}</span>
              {item && <> · {item.title}</>}
            </h2>
            {!item ? (
              <p className="muted" style={{ marginTop: 16 }}>No explanation available for this code yet.</p>
            ) : open.kind === 'carc' ? (
              <CarcBody c={item as Carc} group={open.group} />
            ) : (
              <RarcBody r={item as Rarc} />
            )}
            <p className="small muted" style={{ marginTop: 28 }}>
              Plain-language explanation written for this project and reviewed against the official definition. Official wording:{' '}
              <a href={open.kind === 'carc' ? 'https://x12.org/codes/claim-adjustment-reason-codes' : 'https://x12.org/codes/remittance-advice-remark-codes'} target="_blank" rel="noreferrer">
                X12 code list
              </a>
              .
            </p>
          </aside>
        </>
      )}
    </Ctx.Provider>
  )
}

function CarcBody({ c, group }: { c: Carc; group?: string }) {
  const g = group ? GROUP_CODES[group] : undefined
  return (
    <div className="stack" style={{ marginTop: 14 }}>
      <div className="row">
        <span className="pill violet">{CATEGORY_LABEL[c.category] ?? c.category}</span>
        <span className={`pill ${c.kind === 'denial' ? 'deny' : c.kind === 'patient-share' ? 'warn' : ''}`}>{c.kind}</span>
        {c.stop && <span className="pill warn">retired {c.stop}</span>}
      </div>
      <p style={{ fontSize: 16 }}>{c.plain}</p>
      {g && (
        <div className="panel pad" style={{ background: 'var(--code)' }}>
          <b className="mono">{group}</b> — {g.name}. <span className="muted">{g.who}</span>
        </div>
      )}
      <div>
        <h3>Common causes</h3>
        <ul>{c.causes.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>
      <div>
        <h3>What to do</h3>
        <ol>{c.fix.map((x, i) => <li key={i}>{x}</li>)}</ol>
      </div>
      <div className="row small">
        <span className="pill">Owner: {c.owner}</span>
        <span className="pill">Appeal: {c.appeal}</span>
        {c.groups?.length > 0 && <span className="pill">Usually with {c.groups.join(', ')}</span>}
      </div>
    </div>
  )
}

function RarcBody({ r }: { r: Rarc }) {
  return (
    <div className="stack" style={{ marginTop: 14 }}>
      <div className="row">
        <span className="pill violet">{CATEGORY_LABEL[r.category] ?? r.category}</span>
        {r.alert && <span className="pill">alert (informational)</span>}
      </div>
      <p style={{ fontSize: 16 }}>{r.plain}</p>
      <div className="panel pad" style={{ background: 'var(--code)' }}>
        <h3>Next step</h3>
        <p style={{ marginTop: 4 }}>{r.action}</p>
      </div>
    </div>
  )
}

export function AdjChip({ group, reason, amount, compact }: { group: string; reason: string; amount?: number; compact?: boolean }) {
  const open = useOpenCode()
  const codes = useCodes()
  const c = codes?.carc.get(reason)
  return (
    <button className={`code-chip ${group.toLowerCase()}`} onClick={() => open({ kind: 'carc', code: reason, group })} title={c?.plain}>
      <b>
        {group}-{reason}
      </b>
      {!compact && <span>{c?.title ?? 'Adjustment'}</span>}
      {amount !== undefined && !compact && <span className="mono muted">{amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>}
    </button>
  )
}

export function RemarkChip({ code }: { code: string }) {
  const open = useOpenCode()
  const codes = useCodes()
  const r = codes?.rarc.get(code)
  return (
    <button className="code-chip" onClick={() => open({ kind: 'rarc', code })} title={r?.plain}>
      <b>{code}</b>
      <span>{r?.title ?? 'Remark'}</span>
    </button>
  )
}
