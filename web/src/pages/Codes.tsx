import { useMemo, useState } from 'react'
import { useOpenCode } from '../components/CodeDrawer'
import { CATEGORY_LABEL, useCodes } from '../lib/codes'
import { GROUP_CODES } from '../lib/dictionary'

export default function CodesPage({ query }: { query: string }) {
  const codes = useCodes()
  const open = useOpenCode()
  const [kind, setKind] = useState<'carc' | 'rarc'>(/^(M|MA|N)\d/.test(query) ? 'rarc' : 'carc')
  const [q, setQ] = useState(query)
  const [cat, setCat] = useState('all')
  const [showRetired, setShowRetired] = useState(false)

  const list = useMemo(() => {
    if (!codes) return []
    const all = kind === 'carc' ? [...codes.carc.values()] : [...codes.rarc.values()]
    const needle = q.trim().toLowerCase()
    return all.filter(
      (c) =>
        (showRetired || !c.stop) &&
        (cat === 'all' || c.category === cat) &&
        (!needle || c.code.toLowerCase() === needle || `${c.code} ${c.title} ${c.plain}`.toLowerCase().includes(needle)),
    )
  }, [codes, kind, q, cat, showRetired])

  const cats = useMemo(() => {
    if (!codes) return []
    const m = new Map<string, number>()
    for (const c of kind === 'carc' ? codes.carc.values() : codes.rarc.values()) if (showRetired || !c.stop) m.set(c.category, (m.get(c.category) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1])
  }, [codes, kind, showRetired])

  return (
    <>
      <div className="head">
        <div>
          <h1>Code lookup</h1>
          <p>Every active claim adjustment reason code (CARC) and remittance remark code (RARC), explained in plain English with likely causes and the next step.</p>
        </div>
      </div>

      <div className="grid g5" style={{ marginBottom: 20 }}>
        {Object.entries(GROUP_CODES).filter(([k]) => k !== 'CR').map(([k, g]) => (
          <div className="panel pad" key={k}>
            <b className="mono" style={{ color: k === 'PR' ? 'var(--warn)' : k === 'CO' ? 'var(--deny)' : 'var(--violet)' }}>{k}</b> <b>{g.name}</b>
            <p className="small muted" style={{ marginTop: 4 }}>{g.who}</p>
          </div>
        ))}
        <div className="panel pad">
          <b>Reading a code</b>
          <p className="small muted" style={{ marginTop: 4 }}>
            <span className="mono">CO-45</span> = group code <span className="mono">CO</span> + reason <span className="mono">45</span>. Remark codes add detail.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="pad row" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="row" style={{ gap: 4 }}>
            <button className={`btn ${kind === 'carc' ? 'primary' : ''}`} onClick={() => { setKind('carc'); setCat('all') }}>CARC {codes ? `(${[...codes.carc.values()].filter((c) => !c.stop).length})` : ''}</button>
            <button className={`btn ${kind === 'rarc' ? 'primary' : ''}`} onClick={() => { setKind('rarc'); setCat('all') }}>RARC {codes ? `(${[...codes.rarc.values()].filter((c) => !c.stop).length})` : ''}</button>
          </div>
          <input type="search" placeholder="Search a code or words, e.g. 197, authorization, duplicate…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {cats.map(([c, n]) => <option key={c} value={c}>{CATEGORY_LABEL[c] ?? c} ({n})</option>)}
          </select>
          <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> include retired</label>
        </div>
        {!codes ? (
          <div className="empty">Loading…</div>
        ) : list.length === 0 ? (
          <div className="empty">{codes.carc.size ? 'No codes match.' : 'Code explanations are still being generated.'}</div>
        ) : (
          <div className="scroll-x">
            <table className="t">
              <tbody>
                {list.slice(0, 300).map((c) => (
                  <tr key={c.code} style={{ cursor: 'pointer' }} onClick={() => open({ kind, code: c.code })}>
                    <td style={{ width: 80 }}><b className="mono" style={{ color: 'var(--violet)' }}>{c.code}</b></td>
                    <td>
                      <b>{c.title}</b>
                      <div className="small muted">{c.plain}</div>
                    </td>
                    <td style={{ width: 190 }}><span className="pill">{CATEGORY_LABEL[c.category] ?? c.category}</span>{c.stop && <span className="pill warn" style={{ marginLeft: 6 }}>retired</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length > 300 && <div className="empty small">Showing 300 of {list.length} — refine the search.</div>}
          </div>
        )}
      </div>
    </>
  )
}
