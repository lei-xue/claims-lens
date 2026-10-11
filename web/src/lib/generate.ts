// Synthetic, fully fictional claims: a model of each encounter + its adjudication,
// serialised to valid 837P and 835 files. Same seed → same data.

export type Rng = () => number
export function rng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
const r2 = (n: number) => Math.round(n * 100) / 100

// ---------- reference data (fictional organisations; real code sets) ----------

export const PAYERS = [
  { id: 'NWH01', name: 'NORTHWIND HEALTH PLAN', filing: 'CI', rate: 0.62, copay: 30, strict: 1.0 },
  { id: 'SMM02', name: 'SUMMIT MUTUAL PPO', filing: 'CI', rate: 0.7, copay: 25, strict: 0.8 },
  { id: 'HMC03', name: 'HARBOR MEDICAID PLAN', filing: 'MC', rate: 0.45, copay: 0, strict: 1.4 },
  { id: 'EGM04', name: 'EVERGREEN MEDICARE ADVANTAGE', filing: 'MB', rate: 0.5, copay: 15, strict: 1.2 },
  { id: 'LKP05', name: 'LAKESHORE BENEFITS', filing: 'CI', rate: 0.66, copay: 40, strict: 0.9 },
] as const
export type Payer = (typeof PAYERS)[number]

export const PROVIDER = { name: 'MAPLE GROVE FAMILY MEDICINE', npi: '1234567893', taxId: '871234567', address: ['100 MAPLE GROVE RD', 'SPRINGFIELD', 'IL', '627010000'] }

// CPT codes with our own short labels (official CPT descriptors are AMA-copyrighted).
export const PROCEDURES: Record<string, { label: string; fee: number; visit?: boolean }> = {
  '99203': { label: 'New patient visit, low complexity', fee: 165, visit: true },
  '99213': { label: 'Established patient visit, low complexity', fee: 120, visit: true },
  '99214': { label: 'Established patient visit, moderate complexity', fee: 175, visit: true },
  '99395': { label: 'Preventive visit, age 18–39', fee: 210, visit: true },
  '99396': { label: 'Preventive visit, age 40–64', fee: 230, visit: true },
  '36415': { label: 'Routine venipuncture', fee: 18 },
  '85025': { label: 'Complete blood count with differential', fee: 32 },
  '80053': { label: 'Comprehensive metabolic panel', fee: 45 },
  '83036': { label: 'Hemoglobin A1c', fee: 38 },
  '80061': { label: 'Lipid panel', fee: 52 },
  '87880': { label: 'Rapid strep test', fee: 30 },
  '81002': { label: 'Urinalysis, non-automated', fee: 15 },
  '93000': { label: 'Electrocardiogram with interpretation', fee: 65 },
  '90471': { label: 'Immunization administration', fee: 28 },
  '90686': { label: 'Influenza vaccine, quadrivalent', fee: 42 },
  '20610': { label: 'Major joint injection/aspiration', fee: 140 },
  J1030: { label: 'Methylprednisolone acetate 40 mg injection', fee: 22 },
  '11102': { label: 'Tangential skin biopsy, single lesion', fee: 155 },
}

// ICD-10-CM (public domain, CDC/CMS)
export const DIAGNOSES: Record<string, string> = {
  I10: 'Essential (primary) hypertension',
  'E11.9': 'Type 2 diabetes mellitus without complications',
  'E78.5': 'Hyperlipidemia, unspecified',
  'J02.0': 'Streptococcal pharyngitis',
  'J02.9': 'Acute pharyngitis, unspecified',
  'J06.9': 'Acute upper respiratory infection, unspecified',
  'Z00.00': 'General adult medical exam without abnormal findings',
  'Z23': 'Encounter for immunization',
  'M17.11': 'Unilateral primary osteoarthritis, right knee',
  'N39.0': 'Urinary tract infection, site not specified',
  'R07.9': 'Chest pain, unspecified',
  'L82.1': 'Other seborrheic keratosis',
}

type Line = { code: string; mods: string[]; charge: number; units: number; pointers: number[] }
type Template = { dx: string[]; lines: { code: string; mods?: string[]; pointers: number[] }[] }

const ENCOUNTERS: Template[] = [
  { dx: ['I10', 'E78.5'], lines: [{ code: '99214', pointers: [1, 2] }, { code: '80061', pointers: [2] }, { code: '36415', pointers: [2] }] },
  { dx: ['E11.9', 'I10'], lines: [{ code: '99214', pointers: [1, 2] }, { code: '83036', pointers: [1] }, { code: '80053', pointers: [1] }, { code: '36415', pointers: [1] }] },
  { dx: ['J02.0'], lines: [{ code: '99213', pointers: [1] }, { code: '87880', pointers: [1] }] },
  { dx: ['J06.9'], lines: [{ code: '99213', pointers: [1] }] },
  { dx: ['Z00.00', 'Z23'], lines: [{ code: '99396', pointers: [1] }, { code: '90686', pointers: [2] }, { code: '90471', pointers: [2] }] },
  { dx: ['M17.11'], lines: [{ code: '99213', mods: ['25'], pointers: [1] }, { code: '20610', mods: ['RT'], pointers: [1] }, { code: 'J1030', pointers: [1] }] },
  { dx: ['N39.0'], lines: [{ code: '99213', pointers: [1] }, { code: '81002', pointers: [1] }] },
  { dx: ['R07.9', 'I10'], lines: [{ code: '99214', pointers: [1, 2] }, { code: '93000', pointers: [1] }] },
  { dx: ['L82.1'], lines: [{ code: '99203', pointers: [1] }, { code: '11102', pointers: [1] }] },
]

const FIRST = ['AVA', 'NOAH', 'MIA', 'LIAM', 'ZOE', 'ETHAN', 'LUCY', 'OWEN', 'NORA', 'ELI', 'IVY', 'MASON', 'RUBY', 'LEO', 'ELLA', 'JUDE']
const LAST = ['TESTER', 'SAMPLE', 'EXAMPLE', 'DEMO', 'MOCKLEY', 'FICTION', 'PLACEHOLD', 'SYNTHER']

// ---------- adjudication scenarios ----------

export type Adj = { group: 'CO' | 'PR' | 'OA' | 'PI'; reason: string; amount: number }
export type Outcome = {
  scenario: string
  status: '1' | '2' | '4' | '22'
  lines: { paid: number; allowed: number; adj: Adj[]; remarks: string[] }[]
  claimRemarks: string[]
}

export const SCENARIOS: Record<string, { label: string; weight: number; denial?: boolean }> = {
  paid: { label: 'Paid with contractual write-off and copay', weight: 52 },
  deductible: { label: 'Applied to deductible', weight: 12 },
  coinsurance: { label: 'Paid with coinsurance', weight: 8 },
  missingInfo: { label: 'Denied — missing / invalid information (CO-16)', weight: 3, denial: true },
  medNecessity: { label: 'Denied — not medically necessary (CO-50)', weight: 1.5, denial: true },
  bundled: { label: 'Line denied — bundled into another service (CO-97)', weight: 2.5, denial: true },
  noAuth: { label: 'Denied — no prior authorization (CO-197)', weight: 1.5, denial: true },
  timely: { label: 'Denied — timely filing limit (CO-29)', weight: 0.8, denial: true },
  eligibility: { label: 'Denied — coverage terminated (CO-27)', weight: 1.5, denial: true },
  modifier: { label: 'Line denied — modifier inconsistent (CO-4)', weight: 1, denial: true },
  duplicate: { label: 'Denied — exact duplicate (OA-18)', weight: 1, denial: true },
  cob: { label: 'Denied — another payer is primary (CO-22)', weight: 1, denial: true },
}

function adjudicate(r: Rng, scenario: string, payer: Payer, lines: Line[]): Outcome {
  const out: Outcome = { scenario, status: '1', lines: [], claimRemarks: [] }
  const allowedOf = (l: Line) => r2(l.charge * payer.rate)
  const denyAll = (group: Adj['group'], reason: string, remarks: string[] = []) => {
    out.status = '4'
    out.lines = lines.map((l) => ({ paid: 0, allowed: 0, adj: [{ group, reason, amount: l.charge }], remarks }))
  }
  switch (scenario) {
    case 'missingInfo':
      denyAll('CO', '16', [pick(r, ['M76', 'N290', 'M51'])])
      return out
    case 'medNecessity':
      denyAll('CO', '50', ['N115'])
      return out
    case 'noAuth':
      denyAll('CO', '197')
      return out
    case 'timely':
      denyAll('CO', '29')
      return out
    case 'eligibility':
      denyAll('CO', '27', ['N30'])
      return out
    case 'duplicate':
      denyAll('OA', '18')
      return out
    case 'cob':
      denyAll('CO', '22', ['MA04'])
      return out
  }
  let copayLeft = scenario === 'paid' ? payer.copay : 0
  let deductLeft = scenario === 'deductible' ? 150 + Math.floor(r() * 300) : 0
  lines.forEach((l, i) => {
    const allowed = allowedOf(l)
    const proc = PROCEDURES[l.code]
    if ((scenario === 'bundled' && i > 0 && i === lines.length - 1) || (scenario === 'modifier' && l.mods.length > 0)) {
      const reason = scenario === 'bundled' ? '97' : '4'
      out.lines.push({ paid: 0, allowed: 0, adj: [{ group: 'CO', reason, amount: l.charge }], remarks: scenario === 'bundled' ? ['M15'] : ['M20'] })
      return
    }
    const adj: Adj[] = []
    if (l.charge > allowed) adj.push({ group: 'CO', reason: '45', amount: r2(l.charge - allowed) })
    let patient = 0
    if (copayLeft && proc?.visit) {
      const c = Math.min(copayLeft, allowed)
      adj.push({ group: 'PR', reason: '3', amount: c })
      patient += c
      copayLeft -= c
    }
    if (deductLeft) {
      const d = r2(Math.min(deductLeft, allowed - patient))
      if (d > 0) {
        adj.push({ group: 'PR', reason: '1', amount: d })
        patient += d
        deductLeft = r2(deductLeft - d)
      }
    }
    if (scenario === 'coinsurance') {
      const c = r2((allowed - patient) * 0.2)
      if (c > 0) {
        adj.push({ group: 'PR', reason: '2', amount: c })
        patient += c
      }
    }
    out.lines.push({ paid: r2(allowed - patient), allowed, adj, remarks: [] })
  })
  if (out.lines.every((l) => l.paid === 0) && scenario !== 'deductible') out.status = '4'
  return out
}

// ---------- claims ----------

export type SynthClaim = {
  id: string
  payer: Payer
  patient: { first: string; last: string; dob: string; gender: 'F' | 'M'; memberId: string }
  serviceDate: string // CCYYMMDD
  paidDate: string
  dx: string[]
  lines: Line[]
  charge: number
  outcome: Outcome
  payerClaimId: string
}

const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

function pickScenario(r: Rng, payer: Payer, forced?: string) {
  if (forced) return forced
  const entries = Object.entries(SCENARIOS).map(([k, v]) => [k, v.denial ? v.weight * payer.strict : v.weight] as const)
  let x = r() * entries.reduce((a, [, w]) => a + w, 0)
  for (const [k, w] of entries) if ((x -= w) < 0) return k
  return 'paid'
}

export function makeClaim(seed: number, opts: { scenario?: string; payer?: Payer; day?: Date } = {}): SynthClaim {
  const r = rng(seed)
  const payer = opts.payer ?? pick(r, PAYERS)
  const t = pick(r, ENCOUNTERS)
  const scenario = pickScenario(r, payer, opts.scenario)
  // make sure the modifier scenario has a modifier to reject
  const tpl = scenario === 'modifier' && !t.lines.some((l) => l.mods) ? ENCOUNTERS[5] : scenario === 'bundled' && t.lines.length < 2 ? ENCOUNTERS[0] : t
  const lines: Line[] = tpl.lines.map((l) => ({ code: l.code, mods: l.mods ?? [], charge: PROCEDURES[l.code].fee, units: 1, pointers: l.pointers }))
  const day = opts.day ?? new Date(2026, Math.floor(r() * 9), 1 + Math.floor(r() * 28))
  const paid = new Date(day.getTime() + (14 + Math.floor(r() * 30)) * 86400000)
  const year = 1945 + Math.floor(r() * 60)
  return {
    id: `MGFM${String(seed).padStart(6, '0')}`,
    payer,
    patient: {
      first: pick(r, FIRST),
      last: pick(r, LAST),
      dob: `${year}${String(1 + Math.floor(r() * 12)).padStart(2, '0')}${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`,
      gender: r() < 0.5 ? 'F' : 'M',
      memberId: `${payer.id.slice(0, 3)}${Math.floor(r() * 1e9).toString().padStart(9, '0')}`,
    },
    serviceDate: ymd(day),
    paidDate: ymd(paid),
    dx: tpl.dx,
    lines,
    charge: r2(lines.reduce((a, l) => a + l.charge, 0)),
    outcome: adjudicate(r, scenario, payer, lines),
    payerClaimId: `${new Date(paid).getFullYear()}${Math.floor(r() * 1e10).toString().padStart(10, '0')}`,
  }
}

export function dataset(n = 1200, seed = 2026) {
  return Array.from({ length: n }, (_, i) => makeClaim(seed * 10000 + i))
}

// ---------- serialisers ----------

const pad = (s: string, n: number) => s.padEnd(n, ' ').slice(0, n)
const fmt = (n: number) => (Math.round(n * 100) / 100).toString()

function envelope(fn: 'HC' | 'HP', st: string, guide: string, body: string[], ctrl: number, date: string) {
  const yymmdd = date.slice(2)
  const isa = ['ISA', '00', pad('', 10), '00', pad('', 10), 'ZZ', pad(fn === 'HC' ? 'MAPLEGROVE' : 'PAYERSYS', 15), 'ZZ', pad(fn === 'HC' ? 'CLEARHOUSE' : 'MAPLEGROVE', 15), yymmdd, '1200', '^', '00501', String(ctrl).padStart(9, '0'), '0', 'T', ':'].join('*')
  const segs = [`ST*${st}*0001*${guide}`, ...body]
  segs.push(`SE*${segs.length + 1}*0001`)
  return [isa, `GS*${fn}*${fn === 'HC' ? 'MAPLEGROVE' : 'PAYERSYS'}*${fn === 'HC' ? 'CLEARHOUSE' : 'MAPLEGROVE'}*${date}*1200*${ctrl}*X*005010${guide.slice(6)}`, ...segs, `GE*1*${ctrl}`, `IEA*1*${String(ctrl).padStart(9, '0')}`].join('~\n') + '~'
}

export function to837(claims: SynthClaim[], ctrl = 1001) {
  const c0 = claims[0]
  const p = PROVIDER
  const body = [
    `BHT*0019*00*${ctrl}*${c0.serviceDate}*1200*CH`,
    `NM1*41*2*${p.name}*****46*MGFM01`,
    'PER*IC*BILLING OFFICE*TE*2175550100',
    'NM1*40*2*CLEARHOUSE DEMO*****46*CLRHS',
    'HL*1**20*1',
    'PRV*BI*PXC*207Q00000X',
    `NM1*85*2*${p.name}*****XX*${p.npi}`,
    `N3*${p.address[0]}`,
    `N4*${p.address[1]}*${p.address[2]}*${p.address[3]}`,
    `REF*EI*${p.taxId}`,
  ]
  let hl = 1
  for (const c of claims) {
    hl++
    body.push(
      `HL*${hl}*1*22*0`,
      `SBR*P*18*******${c.payer.filing}`,
      `NM1*IL*1*${c.patient.last}*${c.patient.first}****MI*${c.patient.memberId}`,
      'N3*1 SAMPLE ST',
      `N4*SPRINGFIELD*IL*627020000`,
      `DMG*D8*${c.patient.dob}*${c.patient.gender}`,
      `NM1*PR*2*${c.payer.name}*****PI*${c.payer.id}`,
      `CLM*${c.id}*${fmt(c.charge)}***11:B:1*Y*A*Y*Y`,
      'HI*' + c.dx.map((d, i) => `${i ? 'ABF' : 'ABK'}:${d.replace('.', '')}`).join('*'),
    )
    c.lines.forEach((l, i) => {
      const proc = ['HC', l.code, ...l.mods].join(':')
      body.push(`LX*${i + 1}`, `SV1*${proc}*${fmt(l.charge)}*UN*${l.units}***${l.pointers.join(':')}`, `DTP*472*D8*${c.serviceDate}`)
    })
  }
  return envelope('HC', '837', '005010X222A1', body, ctrl, c0.serviceDate)
}

export function to835(claims: SynthClaim[], ctrl = 5001) {
  const payer = claims[0].payer
  const date = claims.map((c) => c.paidDate).sort().at(-1)!
  const total = claims.reduce((a, c) => a + c.outcome.lines.reduce((b, l) => b + l.paid, 0), 0)
  const body = [
    total > 0
      ? `BPR*I*${fmt(total)}*C*ACH*CCP*01*999999992*DA*123456*1${payer.id}**01*999988880*DA*98765*${date}`
      : `BPR*H*0*C*NON************${date}`,
    `TRN*1*${payer.id}${ctrl}*1${payer.id}`,
    `DTM*405*${date}`,
    `N1*PR*${payer.name}`,
    'N3*PO BOX 1000',
    'N4*CHICAGO*IL*606010000',
    `REF*2U*${payer.id}`,
    `N1*PE*${PROVIDER.name}*XX*${PROVIDER.npi}`,
    `REF*TJ*${PROVIDER.taxId}`,
    'LX*1',
  ]
  for (const c of claims) {
    const o = c.outcome
    const paid = o.lines.reduce((a, l) => a + l.paid, 0)
    const pr = o.lines.flatMap((l) => l.adj).filter((a) => a.group === 'PR').reduce((a, x) => a + x.amount, 0)
    body.push(
      `CLP*${c.id}*${o.status}*${fmt(c.charge)}*${fmt(paid)}*${fmt(pr)}*${c.payer.filing === 'MB' ? 'MB' : c.payer.filing === 'MC' ? 'MC' : '12'}*${c.payerClaimId}*11*1`,
      `NM1*QC*1*${c.patient.last}*${c.patient.first}****MI*${c.patient.memberId}`,
      `NM1*82*1*GROVE*MAPLE****XX*${PROVIDER.npi}`,
      `DTM*232*${c.serviceDate}`,
    )
    if (o.claimRemarks.length) body.push(`MOA***${o.claimRemarks.join('*')}`)
    c.lines.forEach((l, i) => {
      const lo = o.lines[i]
      body.push(`SVC*${['HC', l.code, ...l.mods].join(':')}*${fmt(l.charge)}*${fmt(lo.paid)}**${l.units}`, `DTM*472*${c.serviceDate}`)
      // CAS: one segment per group code, up to 6 reason/amount pairs each
      const byGroup = new Map<string, Adj[]>()
      for (const a of lo.adj) byGroup.set(a.group, [...(byGroup.get(a.group) ?? []), a])
      for (const [g, list] of byGroup) body.push(`CAS*${g}*` + list.map((a) => `${a.reason}*${fmt(a.amount)}`).join('**'))
      if (lo.allowed) body.push(`AMT*B6*${fmt(lo.allowed)}`)
      for (const rm of lo.remarks) body.push(`LQ*HE*${rm}`)
    })
  }
  return envelope('HP', '835', '005010X221A1', body, ctrl, date)
}

export const SAMPLE_SCENARIOS = Object.keys(SCENARIOS)
export function sample(scenario: string, seed = 7) {
  const c = makeClaim(seed * 97 + SAMPLE_SCENARIOS.indexOf(scenario), { scenario })
  return { claim: c, x837: to837([c]), x835: to835([c]) }
}
