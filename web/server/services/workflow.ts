// Denial work-item actions. Every change writes an activity row in the same transaction.
import { eq } from 'drizzle-orm'
import { schema, type Db } from '../db'
import { CARC } from './codes'

const { denials, activities, claims, claimLines, claimPayments, appeals, users, payers } = schema
type Status = (typeof schema.denialStatusEnum.enumValues)[number]

export class WorkflowError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

// Allowed moves; resolved / written_off can be reopened by a manager only.
const NEXT: Record<Status, Status[]> = {
  new: ['in_progress', 'resubmitted', 'appealed', 'written_off', 'resolved'],
  in_progress: ['resubmitted', 'appealed', 'written_off', 'resolved'],
  resubmitted: ['in_progress', 'appealed', 'resolved', 'written_off'],
  appealed: ['in_progress', 'resolved', 'written_off'],
  resolved: ['in_progress'],
  written_off: ['in_progress'],
}

async function load(db: Db, id: number) {
  const [d] = await db.select().from(denials).where(eq(denials.id, id)).limit(1)
  if (!d) throw new WorkflowError('Denial not found', 404)
  return d
}

// resubmit / appeal move the denial too, so they follow the same table (a closed denial must be reopened first)
function checkMove(from: Status, to: Status) {
  if (from !== to && !NEXT[from].includes(to)) throw new WorkflowError(`Cannot move from ${from} to ${to}`)
}

export async function assign(db: Db, id: number, ownerId: number | null, actor: number) {
  const d = await load(db, id)
  if (ownerId) {
    const [u] = await db.select().from(users).where(eq(users.id, ownerId)).limit(1)
    if (!u) throw new WorkflowError('No such user')
  }
  await db.transaction(async (tx) => {
    await tx.update(denials).set({ ownerId, status: d.status === 'new' && ownerId ? 'in_progress' : d.status, updatedAt: new Date() }).where(eq(denials.id, id))
    await tx.insert(activities).values({ denialId: id, claimId: d.claimId, userId: actor, kind: 'assigned', body: { from: d.ownerId, to: ownerId } })
  })
}

export async function setStatus(db: Db, id: number, to: Status, actor: { id: number; role: string }, opts: { note?: string; recovered?: number } = {}) {
  const d = await load(db, id)
  if (!NEXT[d.status].includes(to)) throw new WorkflowError(`Cannot move from ${d.status} to ${to}`)
  if ((d.status === 'resolved' || d.status === 'written_off') && actor.role !== 'manager') throw new WorkflowError('Only a manager can reopen a closed denial', 403)
  if (to === 'written_off' && actor.role !== 'manager' && d.amount > 500) throw new WorkflowError('Write-offs over $500 need a manager', 403)
  const recovered = to === 'resolved' && opts.recovered !== undefined ? Math.max(0, Math.min(opts.recovered, d.amount)) : d.recovered
  await db.transaction(async (tx) => {
    await tx
      .update(denials)
      .set({ status: to, recovered, updatedAt: new Date(), resolvedAt: to === 'resolved' || to === 'written_off' ? new Date() : null })
      .where(eq(denials.id, id))
    await tx.insert(activities).values({ denialId: id, claimId: d.claimId, userId: actor.id, kind: 'status', body: { from: d.status, to, note: opts.note, recovered: to === 'resolved' ? recovered : undefined } })
  })
}

export async function addNote(db: Db, id: number, text: string, actor: number) {
  const d = await load(db, id)
  const body = text.trim().slice(0, 2000)
  if (!body) throw new WorkflowError('Note is empty')
  await db.insert(activities).values({ denialId: id, claimId: d.claimId, userId: actor, kind: 'note', body: { text: body } })
}

/** Corrected claim: a frequency-7 837P referencing the payer's claim number (REF*F8). */
export async function correctedClaim(db: Db, id: number, actor: number, edits: { lineId: number; modifiers?: string[]; procedure?: string }[] = []) {
  const d = await load(db, id)
  checkMove(d.status, 'resubmitted')
  if (!d.claimId) throw new WorkflowError('This denial is not matched to a submitted claim')
  const [c] = await db.select().from(claims).where(eq(claims.id, d.claimId))
  const lines = await db.select().from(claimLines).where(eq(claimLines.claimId, c.id)).orderBy(claimLines.lineNo)
  const [cp] = await db.select().from(claimPayments).where(eq(claimPayments.id, d.claimPaymentId))
  const [payer] = c.payerId ? await db.select().from(payers).where(eq(payers.id, c.payerId)) : []
  const edited = lines.map((l) => {
    const e = edits.find((x) => x.lineId === l.id)
    return { ...l, procedure: e?.procedure ?? l.procedure, modifiers: e?.modifiers ?? l.modifiers }
  })
  const text = build837Corrected(c, edited, cp.payerClaimId, payer)
  await db.transaction(async (tx) => {
    await tx.update(denials).set({ status: 'resubmitted', updatedAt: new Date() }).where(eq(denials.id, id))
    await tx.insert(activities).values({ denialId: id, claimId: c.id, userId: actor, kind: 'resubmitted', body: { edits, originalClaim: cp.payerClaimId } })
  })
  return text
}

function build837Corrected(c: typeof claims.$inferSelect, lines: (typeof claimLines.$inferSelect)[], payerClaimId: string, payer?: typeof payers.$inferSelect) {
  const d8 = c.serviceDate.replaceAll('-', '')
  const now = new Date()
  const ymd = now.toISOString().slice(0, 10).replaceAll('-', '')
  const ctrl = String(now.getTime() % 1e9).padStart(9, '0')
  const [last, first] = [c.patientName.split(' ').slice(-1)[0], c.patientName.split(' ').slice(0, -1).join(' ')]
  const pad = (s: string, n: number) => s.padEnd(n, ' ').slice(0, n)
  const body = [
    `ST*837*0001*005010X222A1`,
    `BHT*0019*00*${ctrl}*${ymd}*1200*CH`,
    `NM1*41*2*MAPLE GROVE FAMILY MEDICINE*****46*MGFM01`,
    `PER*IC*BILLING OFFICE*TE*2175550100`,
    `NM1*40*2*CLEARHOUSE DEMO*****46*CLRHS`,
    `HL*1**20*1`,
    `NM1*85*2*MAPLE GROVE FAMILY MEDICINE*****XX*1234567893`,
    `N3*100 MAPLE GROVE RD`,
    `N4*SPRINGFIELD*IL*627010000`,
    `REF*EI*871234567`,
    `HL*2*1*22*0`,
    `SBR*P*18*******CI`,
    `NM1*IL*1*${last}*${first}****MI*${c.memberId}`,
    `NM1*PR*2*${payer?.name ?? 'PAYER'}*****PI*${payer?.code ?? ''}`,
    `CLM*${c.patientControl}*${lines.reduce((s, l) => s + l.charge, 0).toFixed(2)}***${c.pos}:B:7*Y*A*Y*Y`,
    `REF*F8*${payerClaimId}`,
    'HI*' + c.diagnoses.map((x, i) => `${i ? 'ABF' : 'ABK'}:${x}`).join('*'),
    ...lines.flatMap((l, i) => [
      `LX*${i + 1}`,
      `SV1*${['HC', l.procedure, ...l.modifiers].join(':')}*${l.charge.toFixed(2)}*UN*${l.units}***${l.dxPointers.join(':')}`,
      `DTP*472*D8*${d8}`,
    ]),
  ]
  body.push(`SE*${body.length + 1}*0001`)
  return [
    `ISA*00*${pad('', 10)}*00*${pad('', 10)}*ZZ*${pad('MAPLEGROVE', 15)}*ZZ*${pad('CLEARHOUSE', 15)}*${ymd.slice(2)}*1200*^*00501*${ctrl}*0*T*:`,
    `GS*HC*MAPLEGROVE*CLEARHOUSE*${ymd}*1200*${Number(ctrl)}*X*005010X222A1`,
    ...body,
    `GE*1*${Number(ctrl)}`,
    `IEA*1*${ctrl}`,
  ].join('~\n') + '~'
}

/** Appeal letter drafted from the denial, the claim and the code explanation. */
export async function draftAppeal(db: Db, id: number, actor: number, extra = '') {
  const d = await load(db, id)
  checkMove(d.status, 'appealed')
  const [c] = d.claimId ? await db.select().from(claims).where(eq(claims.id, d.claimId)) : []
  const [cp] = await db.select().from(claimPayments).where(eq(claimPayments.id, d.claimPaymentId))
  const [payer] = d.payerId ? await db.select().from(payers).where(eq(payers.id, d.payerId)) : []
  const lines = c ? await db.select().from(claimLines).where(eq(claimLines.claimId, c.id)).orderBy(claimLines.lineNo) : []
  const reason = d.primaryCode.split('-')[1]
  const carc = CARC.get(reason)
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const letter = `${today}

${payer?.name ?? 'Claims Appeals Department'}
Attn: Provider Appeals

RE: Request for reconsideration
Patient: ${c?.patientName ?? '—'}   Member ID: ${c?.memberId ?? '—'}
Date of service: ${c?.serviceDate ?? '—'}
Payer claim number: ${cp.payerClaimId}   Patient account: ${cp.patientControl}
Billed: $${cp.charge.toFixed(2)}   Denied: $${d.amount.toFixed(2)}   Denial: ${d.codes.join(', ')}${carc ? ` (${carc.title})` : ''}

To whom it may concern,

Maple Grove Family Medicine requests reconsideration of the claim above, which was denied on ${d.deniedOn} with adjustment ${d.primaryCode}${carc ? ` — ${carc.plain.replace(/\.$/, '')}` : ''}.

The services billed were:
${lines.map((l) => `  • ${l.procedure}${l.modifiers.length ? '-' + l.modifiers.join('-') : ''}  $${l.charge.toFixed(2)}`).join('\n') || '  • (see attached claim)'}
Diagnoses: ${c?.diagnoses.join(', ') ?? '—'}

${extra.trim() || '[Explain why the service should be paid: documentation of medical necessity, proof of authorization or eligibility, corrected coding, or the policy provision that supports payment.]'}

Enclosed: copy of the claim, the remittance advice, and supporting medical records.
We ask that the claim be reprocessed for payment. Please contact our billing office at (217) 555-0100 with any questions.

Sincerely,

Billing Office
Maple Grove Family Medicine
NPI 1234567893`
  await db.transaction(async (tx) => {
    await tx.insert(appeals).values({ denialId: id, letter, createdBy: actor })
    if (d.status !== 'appealed') await tx.update(denials).set({ status: 'appealed', updatedAt: new Date() }).where(eq(denials.id, id))
    await tx.insert(activities).values({ denialId: id, claimId: d.claimId, userId: actor, kind: 'appeal', body: { chars: letter.length } })
  })
  return letter
}
