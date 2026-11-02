// Minimal hand-built X12 files for tests: just enough segments for the parser and importers.
const pad = (s: string, n: number) => s.padEnd(n, ' ').slice(0, n)
const fmt = (n: number) => (Math.round(n * 100) / 100).toString()

/** Wrap transaction bodies (segments between ST and SE) in ISA/GS … GE/IEA, one ST/SE per body. */
export function interchange(st: '835' | '837', bodies: string[][], opts: { ctrl?: number; element?: string } = {}) {
  const ctrl = opts.ctrl ?? 1
  const guide = st === '835' ? '005010X221A1' : '005010X222A1'
  const fn = st === '835' ? 'HP' : 'HC'
  const isa = ['ISA', '00', pad('', 10), '00', pad('', 10), 'ZZ', pad('SENDER', 15), 'ZZ', pad('RECEIVER', 15), '261102', '1200', '^', '00501', String(ctrl).padStart(9, '0'), '0', 'T', ':'].join('*')
  const sets = bodies.flatMap((body, i) => {
    const n = String(i + 1).padStart(4, '0')
    return [`ST*${st}*${n}*${guide}`, ...body, `SE*${body.length + 2}*${n}`]
  })
  const text = [isa, `GS*${fn}*SENDER*RECEIVER*20261102*1200*${ctrl}*X*${guide}`, ...sets, `GE*${bodies.length}*${ctrl}`, `IEA*1*${String(ctrl).padStart(9, '0')}`].join('~\n') + '~'
  return opts.element ? text.replaceAll('*', opts.element) : text
}

export type ClpSpec = { pcn: string; status: string; charge: number; paid: number; pr?: number; payerClaim?: string; cas?: string[]; segments?: string[] }

/** One 835 transaction body: one payment from one payer; extra segments (SVC, CAS…) go after each CLP. */
export function remitBody(p: { payerId: string; payerName: string; trace: string; date?: string; claims: ClpSpec[] }) {
  const date = p.date ?? '20261102'
  const total = p.claims.reduce((a, c) => a + c.paid, 0)
  return [
    `BPR*I*${fmt(total)}*C*ACH*CCP*01*999999992*DA*123456*1${p.payerId}**01*999988880*DA*98765*${date}`,
    `TRN*1*${p.trace}*1${p.payerId}`,
    `N1*PR*${p.payerName}`,
    `REF*2U*${p.payerId}`,
    `N1*PE*MAPLE GROVE FAMILY MEDICINE*XX*1234567893`,
    'LX*1',
    ...p.claims.flatMap((c) => [
      `CLP*${c.pcn}*${c.status}*${fmt(c.charge)}*${fmt(c.paid)}*${fmt(c.pr ?? 0)}*12*${c.payerClaim ?? 'PCL' + c.pcn}*11*1`,
      `NM1*QC*1*TESTER*AVA****MI*M123`,
      ...(c.cas ?? []).map((x) => `CAS*${x}`),
      ...(c.segments ?? []),
    ]),
  ]
}

export const remit835 = (p: Parameters<typeof remitBody>[0], ctrl?: number) => interchange('835', [remitBody(p)], { ctrl })

export type ClmSpec = { pcn: string; payerId: string; payerName: string; freq?: string; lines: { code: string; charge: number; units?: string }[]; date?: string }

/** One 837P transaction body (BHT03 = ref), one subscriber loop per claim. */
export function claimBody(ref: string, cs: ClmSpec[]) {
  const body = [
    `BHT*0019*00*${ref}*20261102*1200*CH`,
    'NM1*41*2*MAPLE GROVE FAMILY MEDICINE*****46*MGFM01',
    'NM1*40*2*CLEARHOUSE DEMO*****46*CLRHS',
    'HL*1**20*1',
    'NM1*85*2*MAPLE GROVE FAMILY MEDICINE*****XX*1234567893',
    'REF*EI*871234567',
  ]
  cs.forEach((c, i) => {
    const total = c.lines.reduce((a, l) => a + l.charge, 0)
    body.push(
      `HL*${i + 2}*1*22*0`,
      'SBR*P*18*******CI',
      'NM1*IL*1*TESTER*AVA****MI*M123',
      `NM1*PR*2*${c.payerName}*****PI*${c.payerId}`,
      `CLM*${c.pcn}*${fmt(total)}***11:B:${c.freq ?? '1'}*Y*A*Y*Y`,
      'HI*ABK:I10',
      ...c.lines.flatMap((l, n) => [`LX*${n + 1}`, `SV1*HC:${l.code}*${fmt(l.charge)}*UN*${l.units ?? '1'}***1`, `DTP*472*D8*${c.date ?? '20261020'}`]),
    )
  })
  return body
}

export const claim837 = (ref: string, cs: ClmSpec[], ctrl?: number) => interchange('837', [claimBody(ref, cs)], { ctrl })
