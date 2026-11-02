// Turns parsed segments into a readable model of an 835 remittance or an 837P claim,
// and runs the balancing / integrity checks a biller would do by hand.
import { cents, comp, el, parse, validNpi, type Delims, type Segment } from './x12'

export type Issue = { level: 'error' | 'warning'; message: string; segment?: number }
export type Adjustment = { group: string; reason: string; amount: number; quantity?: string; segment: number }

export type RemitService = {
  procedure: string
  modifiers: string[]
  charge: number
  paid: number
  units: string
  date?: string
  allowed?: number
  adjustments: Adjustment[]
  remarks: string[]
  segment: number
}
export type RemitClaim = {
  patientControl: string
  status: string
  charge: number
  paid: number
  patientResp: number
  payerClaim: string
  patient: string
  memberId: string
  adjustments: Adjustment[]
  services: RemitService[]
  remarks: string[]
  segment: number
}
export type Remit = {
  type: '835'
  payer: string
  payerId: string
  payee: string
  payeeNpi: string
  payment: number
  method: string
  paymentDate: string
  trace: string
  claims: RemitClaim[]
  providerAdjustments: { reason: string; reference: string; amount: number }[]
}

export type ClaimLine = { procedure: string; modifiers: string[]; charge: number; units: string; pos: string; pointers: string[]; date?: string; segment: number }
export type Claim837 = {
  patientControl: string
  charge: number
  pos: string
  frequency: string
  diagnoses: { code: string; principal: boolean }[]
  lines: ClaimLine[]
  priorAuth?: string
  subscriber: string
  memberId: string
  patient: string
  payer: string
  payerId: string
  segment: number
}
export type Submission = {
  type: '837P'
  /** BHT03, the submitter's reference for this batch (ST02 when absent) */
  reference: string
  submitter: string
  billing: { name: string; npi: string; taxId: string }
  claims: Claim837[]
}

/** One ST…SE transaction set: an 835 is one payment from one payer, so a file can hold several. */
export type Transaction = { doc: Remit | Submission | null; issues: Issue[] }

export type Result = {
  delims: Delims
  segments: Segment[]
  /** the first transaction's document (most files carry exactly one) */
  doc: Remit | Submission | null
  /** every transaction set in the file, in order */
  transactions: Transaction[]
  issues: Issue[]
  /** segment index → loop label, for the raw view */
  loops: Record<number, string>
}

const num = (v: string) => Number(v || 0)
const name = (s?: Segment) => (s ? [el(s, 4), el(s, 3)].filter(Boolean).join(' ').trim() || el(s, 3) : '')

function casAdjustments(s: Segment): Adjustment[] {
  const out: Adjustment[] = []
  for (let i = 2; i <= 17; i += 3) {
    const reason = el(s, i)
    if (!reason) continue
    out.push({ group: el(s, 1), reason, amount: num(el(s, i + 1)), quantity: el(s, i + 2) || undefined, segment: s.index })
  }
  return out
}

/** ST/SE pairing and counts for one transaction set (segs = its ST … SE). */
function transactionChecks(segs: Segment[], issues: Issue[]) {
  const st = segs[0]
  const se = segs.at(-1)
  if (!st || st.id !== 'ST' || !se || se.id !== 'SE') {
    issues.push({ level: 'error', message: 'Missing ST or SE segment.', segment: st?.index })
    return
  }
  if (num(el(se, 1)) !== segs.length)
    issues.push({ level: 'error', message: `SE01 says ${el(se, 1)} segments but the transaction has ${segs.length}.`, segment: se.index })
  if (el(st, 2) !== el(se, 2))
    issues.push({ level: 'error', message: `ST02 control number ${el(st, 2)} does not match SE02 ${el(se, 2)}.`, segment: se.index })
}

function interchangeChecks(segs: Segment[], issues: Issue[]) {
  const isa = segs.find((s) => s.id === 'ISA')
  const iea = segs.find((s) => s.id === 'IEA')
  if (isa && iea && el(isa, 13) !== el(iea, 2))
    issues.push({ level: 'error', message: `ISA13 control number does not match IEA02.`, segment: iea.index })
}

/** Split the segments into ST … SE transaction sets (an unterminated one runs to the next ST or the end). */
function splitTransactions(segs: Segment[]): Segment[][] {
  const out: Segment[][] = []
  let cur: Segment[] | null = null
  for (const s of segs) {
    if (s.id === 'ST') out.push((cur = [s]))
    else if (cur) {
      cur.push(s)
      if (s.id === 'SE') cur = null
    }
  }
  return out
}

function read835(segs: Segment[], d: Delims, issues: Issue[], loops: Record<number, string>): Remit {
  const bpr = segs.find((s) => s.id === 'BPR')
  const trn = segs.find((s) => s.id === 'TRN')
  const remit: Remit = {
    type: '835',
    payer: '',
    payerId: '',
    payee: '',
    payeeNpi: '',
    payment: num(el(bpr, 2)),
    method: el(bpr, 4),
    paymentDate: el(bpr, 16),
    trace: el(trn, 2),
    claims: [],
    providerAdjustments: [],
  }
  let claim: RemitClaim | null = null
  let svc: RemitService | null = null
  let loop = 'Header'
  for (const s of segs) {
    if (s.id === 'N1' && el(s, 1) === 'PR') {
      loop = '1000A Payer'
      remit.payer = el(s, 2)
    } else if (s.id === 'N1' && el(s, 1) === 'PE') {
      loop = '1000B Payee'
      remit.payee = el(s, 2)
      if (el(s, 3) === 'XX') remit.payeeNpi = el(s, 4)
    } else if (s.id === 'REF' && el(s, 1) === '2U' && loop.startsWith('1000A')) remit.payerId = el(s, 2)
    else if (s.id === 'LX') loop = '2000 Claim group'
    else if (s.id === 'CLP') {
      loop = '2100 Claim'
      svc = null
      claim = {
        patientControl: el(s, 1), status: el(s, 2), charge: num(el(s, 3)), paid: num(el(s, 4)), patientResp: num(el(s, 5)),
        payerClaim: el(s, 7), patient: '', memberId: '', adjustments: [], services: [], remarks: [], segment: s.index,
      }
      remit.claims.push(claim)
    } else if (s.id === 'SVC' && claim) {
      loop = '2110 Service'
      const proc = el(s, 1)
      svc = {
        procedure: comp(proc, d, 2), modifiers: proc.split(d.component).slice(2).filter(Boolean),
        charge: num(el(s, 2)), paid: num(el(s, 3)), units: el(s, 5) || '1', adjustments: [], remarks: [], segment: s.index,
      }
      claim.services.push(svc)
    } else if (s.id === 'NM1' && claim && el(s, 1) === 'QC') {
      claim.patient = name(s)
      claim.memberId = el(s, 9)
    } else if (s.id === 'CAS') {
      ;(svc ?? claim)?.adjustments.push(...casAdjustments(s))
    } else if (s.id === 'DTM' && svc && el(s, 1) === '472') svc.date = el(s, 2)
    else if (s.id === 'AMT' && svc && el(s, 1) === 'B6') svc.allowed = num(el(s, 2))
    else if (s.id === 'LQ' && el(s, 1) === 'HE') (svc ?? claim)?.remarks.push(el(s, 2))
    else if ((s.id === 'MOA' || s.id === 'MIA') && claim) claim.remarks.push(...s.elements.slice(2).filter((x) => /^[A-Z]{1,2}\d+$/.test(x)))
    else if (s.id === 'PLB') {
      loop = 'Provider adjustments'
      for (let i = 3; i <= 13; i += 2) {
        if (!el(s, i)) continue
        remit.providerAdjustments.push({ reason: comp(el(s, i), d, 1), reference: comp(el(s, i), d, 2), amount: num(el(s, i + 1)) })
      }
    } else if (s.id === 'SE') loop = 'Trailer'
    loops[s.index] = loop
  }

  // --- balancing, the core 835 checks ---
  const claimPaid = remit.claims.reduce((a, c) => a + cents(c.paid), 0)
  const plb = remit.providerAdjustments.reduce((a, p) => a + cents(p.amount), 0)
  if (claimPaid - plb !== cents(remit.payment))
    issues.push({ level: 'error', message: `Payment does not balance: claims paid ${(claimPaid / 100).toFixed(2)} − provider adjustments ${(plb / 100).toFixed(2)} ≠ BPR02 ${remit.payment.toFixed(2)}.`, segment: bpr?.index })
  for (const c of remit.claims) {
    const adj = [...c.adjustments, ...c.services.flatMap((s) => s.adjustments)].reduce((a, x) => a + cents(x.amount), 0)
    if (cents(c.charge) - adj !== cents(c.paid))
      issues.push({ level: 'error', message: `Claim ${c.patientControl}: charge ${c.charge.toFixed(2)} − adjustments ${(adj / 100).toFixed(2)} ≠ paid ${c.paid.toFixed(2)}.`, segment: c.segment })
    const pr = [...c.adjustments, ...c.services.flatMap((s) => s.adjustments)].filter((x) => x.group === 'PR').reduce((a, x) => a + cents(x.amount), 0)
    if (pr !== cents(c.patientResp))
      issues.push({ level: 'warning', message: `Claim ${c.patientControl}: CLP05 patient responsibility ${c.patientResp.toFixed(2)} ≠ sum of PR adjustments ${(pr / 100).toFixed(2)}.`, segment: c.segment })
    for (const s of c.services) {
      const sa = s.adjustments.reduce((a, x) => a + cents(x.amount), 0)
      if (cents(s.charge) - sa !== cents(s.paid))
        issues.push({ level: 'error', message: `Claim ${c.patientControl}, line ${s.procedure}: charge − adjustments ≠ line paid.`, segment: s.segment })
    }
    if (c.services.length && c.services.reduce((a, s) => a + cents(s.paid), 0) !== cents(c.paid))
      issues.push({ level: 'error', message: `Claim ${c.patientControl}: service lines paid do not add up to CLP04.`, segment: c.segment })
    if (c.status === '4' && c.paid !== 0)
      issues.push({ level: 'warning', message: `Claim ${c.patientControl} has status 4 (denied) but a non-zero payment.`, segment: c.segment })
  }
  if (remit.payeeNpi && !validNpi(remit.payeeNpi)) issues.push({ level: 'warning', message: `Payee NPI ${remit.payeeNpi} fails the NPI check-digit test.` })
  return remit
}

function read837(segs: Segment[], d: Delims, issues: Issue[], loops: Record<number, string>): Submission {
  const sub: Submission = { type: '837P', reference: el(segs.find((s) => s.id === 'BHT'), 3) || el(segs.find((s) => s.id === 'ST'), 2), submitter: '', billing: { name: '', npi: '', taxId: '' }, claims: [] }
  let loop = 'Header'
  let hl = ''
  let subscriber = ''
  let memberId = ''
  let patient = ''
  let payer = ''
  let payerId = ''
  let claim: Claim837 | null = null
  let line: ClaimLine | null = null
  for (const s of segs) {
    if (s.id === 'NM1' && el(s, 1) === '41') {
      loop = '1000A Submitter'
      sub.submitter = name(s)
    } else if (s.id === 'NM1' && el(s, 1) === '40') loop = '1000B Receiver'
    else if (s.id === 'HL') {
      hl = el(s, 3)
      loop = hl === '20' ? '2000A Billing provider' : hl === '22' ? '2000B Subscriber' : '2000C Patient'
      claim = null
      line = null
    } else if (s.id === 'NM1' && el(s, 1) === '85') {
      loop = '2010AA Billing provider'
      sub.billing.name = name(s)
      sub.billing.npi = el(s, 9)
    } else if (s.id === 'REF' && el(s, 1) === 'EI' && loop.startsWith('2010AA')) sub.billing.taxId = el(s, 2)
    else if (s.id === 'NM1' && el(s, 1) === 'IL') {
      loop = '2010BA Subscriber'
      subscriber = patient = name(s)
      memberId = el(s, 9)
    } else if (s.id === 'NM1' && el(s, 1) === 'PR') {
      loop = '2010BB Payer'
      payer = el(s, 3)
      payerId = el(s, 9)
    } else if (s.id === 'NM1' && el(s, 1) === 'QC') {
      loop = '2010CA Patient'
      patient = name(s)
    } else if (s.id === 'CLM') {
      loop = '2300 Claim'
      line = null
      const pos = el(s, 5)
      claim = {
        patientControl: el(s, 1), charge: num(el(s, 2)), pos: comp(pos, d, 1), frequency: comp(pos, d, 3),
        diagnoses: [], lines: [], subscriber, memberId, patient, payer, payerId, segment: s.index,
      }
      sub.claims.push(claim)
    } else if (s.id === 'HI' && claim) {
      for (const x of s.elements) if (x) claim.diagnoses.push({ code: comp(x, d, 2), principal: comp(x, d, 1) === 'ABK' })
    } else if (s.id === 'REF' && claim && el(s, 1) === 'G1') claim.priorAuth = el(s, 2)
    else if (s.id === 'LX') loop = '2400 Service line'
    else if (s.id === 'SV1' && claim) {
      const proc = el(s, 1)
      line = {
        procedure: comp(proc, d, 2), modifiers: proc.split(d.component).slice(2).filter(Boolean),
        charge: num(el(s, 2)), units: el(s, 4), pos: el(s, 5) || claim.pos, pointers: el(s, 7).split(d.component).filter(Boolean), segment: s.index,
      }
      claim.lines.push(line)
    } else if (s.id === 'DTP' && line && el(s, 1) === '472') line.date = el(s, 3)
    else if (s.id === 'SE') loop = 'Trailer'
    loops[s.index] = loop
  }

  if (sub.billing.npi && !validNpi(sub.billing.npi)) issues.push({ level: 'error', message: `Billing provider NPI ${sub.billing.npi} fails the NPI check-digit test.` })
  for (const c of sub.claims) {
    const total = c.lines.reduce((a, l) => a + cents(l.charge), 0)
    if (total !== cents(c.charge))
      issues.push({ level: 'error', message: `Claim ${c.patientControl}: CLM02 total ${c.charge.toFixed(2)} ≠ sum of line charges ${(total / 100).toFixed(2)}.`, segment: c.segment })
    if (!c.diagnoses.length) issues.push({ level: 'error', message: `Claim ${c.patientControl} has no diagnosis codes (HI).`, segment: c.segment })
    if (c.diagnoses.length && !c.diagnoses[0].principal) issues.push({ level: 'warning', message: `Claim ${c.patientControl}: the first diagnosis should use qualifier ABK (principal).`, segment: c.segment })
    for (const l of c.lines) {
      const bad = l.pointers.filter((p) => !(Number(p) >= 1 && Number(p) <= c.diagnoses.length))
      if (bad.length) issues.push({ level: 'error', message: `Claim ${c.patientControl}, line ${l.procedure}: diagnosis pointer ${bad.join(', ')} does not point to a diagnosis.`, segment: l.segment })
      if (!l.date) issues.push({ level: 'warning', message: `Claim ${c.patientControl}, line ${l.procedure}: no service date (DTP*472).`, segment: l.segment })
    }
  }
  return sub
}

export function interpret(text: string): Result {
  const { delims, segments } = parse(text)
  const issues: Issue[] = []
  const loops: Record<number, string> = {}
  interchangeChecks(segments, issues)
  const sets = splitTransactions(segments)
  if (!sets.length) {
    issues.push({ level: 'error', message: 'Missing ST or SE segment.' })
    issues.push({ level: 'warning', message: 'Transaction set (none) is not supported — showing raw segments only.' })
  }
  const transactions: Transaction[] = sets.map((segs) => {
    const own: Issue[] = []
    transactionChecks(segs, own)
    const type = el(segs[0], 1)
    let doc: Remit | Submission | null = null
    if (type === '835') doc = read835(segs, delims, own, loops)
    else if (type === '837') doc = read837(segs, delims, own, loops)
    else {
      own.push({ level: 'warning', message: `Transaction set ${type || '(none)'} is not supported — showing raw segments only.`, segment: segs[0].index })
      for (const s of segs) loops[s.index] = ''
    }
    issues.push(...own)
    return { doc, issues: own }
  })
  // envelope segments outside any transaction set
  const firstSt = segments.findIndex((s) => s.id === 'ST')
  if (firstSt >= 0) for (const s of segments) if (loops[s.index] === undefined) loops[s.index] = s.index < firstSt || s.id === 'ISA' || s.id === 'GS' ? 'Header' : 'Trailer'
  return { delims, segments, doc: transactions[0]?.doc ?? null, transactions, issues, loops }
}

/** The transaction set a file carries (ST01 of its first ST), read with the file's own delimiters. */
export function transactionType(text: string): string | null {
  try {
    const st = parse(text).segments.find((s) => s.id === 'ST')
    return el(st, 1) || null
  } catch {
    return null
  }
}
