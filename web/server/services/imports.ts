// Importing 837P claims and 835 remittances: parse with the same library the browser uses,
// store everything, match remittances back to submitted claims and open denial work items.
import { and, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import { interpret, type Remit, type Submission } from '../../src/lib/interpret'
import { schema, type Db, type Tx } from '../db'
import { appealWindowDays, categoryOf, isDenial } from './codes'

const { payers, claims, claimLines, remittances, claimPayments, linePayments, adjustments, denials, activities } = schema

export class ImportError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

const isoDate = (ccyymmdd: string) => `${ccyymmdd.slice(0, 4)}-${ccyymmdd.slice(4, 6)}-${ccyymmdd.slice(6, 8)}`
const r2 = (n: number) => Math.round(n * 100) / 100

async function upsertPayer(tx: Tx, code: string, name: string) {
  const key = code || name
  const [row] = await tx.insert(payers).values({ code: key, name: name || key }).onConflictDoUpdate({ target: payers.code, set: { name: name || key } }).returning()
  return row
}

export type ClaimImportResult = { claims: number; duplicates: number; issues: { level: string; message: string }[] }

export async function import837(db: Db, text: string, userId: number | null): Promise<ClaimImportResult> {
  let r
  try {
    r = interpret(text)
  } catch (e) {
    throw new ImportError((e as Error).message)
  }
  if (!r.transactions.length || r.transactions.some((t) => t.doc?.type !== '837P')) throw new ImportError('This file is not an 837P professional claim.')
  const errors = r.issues.filter((i) => i.level === 'error')
  if (errors.length) throw new ImportError(`The 837P has ${errors.length} error(s): ${errors[0].message}`)
  const docs = r.transactions.map((t) => t.doc as Submission)
  let inserted = 0
  let duplicates = 0
  await db.transaction(async (tx) => {
    for (const c of docs.flatMap((d) => d.claims)) {
      const payer = await upsertPayer(tx, c.payerId, c.payer)
      const date = c.lines.find((l) => l.date)?.date
      const [row] = await tx
        .insert(claims)
        .values({
          patientControl: c.patientControl, payerId: payer.id, patientName: c.patient, memberId: c.memberId,
          serviceDate: date ? isoDate(date) : new Date().toISOString().slice(0, 10), pos: c.pos,
          diagnoses: c.diagnoses.map((d) => d.code), totalCharge: c.charge, frequency: c.frequency || '1',
        })
        .onConflictDoNothing()
        .returning()
      if (!row) {
        duplicates++
        continue
      }
      inserted++
      const lines = await tx.insert(claimLines).values(
        c.lines.map((l, n) => ({
          claimId: row.id, lineNo: n + 1, procedure: l.procedure, modifiers: l.modifiers, charge: l.charge,
          units: Number(l.units) || 1, dxPointers: l.pointers.map(Number),
        })),
      ).returning()
      await tx.insert(activities).values({ claimId: row.id, userId, kind: c.frequency === '7' ? 'resubmitted' : 'submitted', body: { charge: c.charge } })
      await linkOrphans(tx, row.id, c.patientControl, lines)
    }
  })
  return { claims: inserted, duplicates, issues: r.issues }
}

type Line = typeof claimLines.$inferSelect
/** The submitted line an SVC paid: same procedure and modifiers first, else same procedure. */
function matchLine(lines: Line[], used: Set<number>, s: { procedure: string; modifiers: string[] }) {
  const line = lines.find((l) => !used.has(l.id) && l.procedure === s.procedure && l.modifiers.join() === s.modifiers.join()) ?? lines.find((l) => !used.has(l.id) && l.procedure === s.procedure)
  if (line) used.add(line.id)
  return line
}

/** Remittances that arrived before their 837 was imported: attach their payments and denials to the claim. */
async function linkOrphans(tx: Tx, claimId: number, patientControl: string, lines: Line[]) {
  const cps = await tx.update(claimPayments).set({ claimId }).where(and(eq(claimPayments.patientControl, patientControl), isNull(claimPayments.claimId))).returning({ id: claimPayments.id })
  if (!cps.length) return
  const ids = cps.map((x) => x.id)
  for (const id of ids) {
    const used = new Set<number>()
    for (const lp of await tx.select().from(linePayments).where(and(eq(linePayments.claimPaymentId, id), isNull(linePayments.claimLineId))).orderBy(linePayments.id)) {
      const line = matchLine(lines, used, lp)
      if (line) await tx.update(linePayments).set({ claimLineId: line.id }).where(eq(linePayments.id, lp.id))
    }
  }
  const ds = await tx.update(denials).set({ claimId }).where(and(inArray(denials.claimPaymentId, ids), isNull(denials.claimId))).returning({ id: denials.id })
  if (ds.length) await tx.update(activities).set({ claimId }).where(and(inArray(activities.denialId, ds.map((d) => d.id)), isNull(activities.claimId)))
}

export type RemitImportResult = {
  /** first remittance created (a file with several ST/SE transactions creates one per transaction) */
  remittanceId: number
  remittances: { id: number; payer: string; trace: string; payment: number }[]
  payer: string
  payment: number
  claims: number
  matched: number
  unmatched: string[]
  newDenials: number
  resolved: number
  issues: { level: string; message: string }[]
}

export async function import835(db: Db, text: string, userId: number | null, fileName?: string): Promise<RemitImportResult> {
  let r
  try {
    r = interpret(text)
  } catch (e) {
    throw new ImportError((e as Error).message)
  }
  if (!r.transactions.length || r.transactions.some((t) => t.doc?.type !== '835')) throw new ImportError('This file is not an 835 remittance.')
  const issues = r.issues.map(({ level, message }) => ({ level, message }))

  return db.transaction(async (tx) => {
    const result: RemitImportResult = {
      remittanceId: 0, remittances: [], payer: '', payment: 0, claims: 0,
      matched: 0, unmatched: [], newDenials: 0, resolved: 0, issues,
    }
    // one remittance per ST/SE transaction: each is its own payment (BPR/TRN) from its own payer (N1*PR)
    for (const t of r.transactions) await importRemit(tx, t.doc as Remit, t.issues.map(({ level, message }) => ({ level, message })), text, userId, fileName, result)
    result.remittanceId = result.remittances[0].id
    result.payer = [...new Set(result.remittances.map((x) => x.payer))].join(', ')
    result.payment = r2(result.remittances.reduce((s, x) => s + x.payment, 0))
    return result
  })
}

async function importRemit(tx: Tx, doc: Remit, issues: { level: string; message: string }[], text: string, userId: number | null, fileName: string | undefined, result: RemitImportResult) {
  const payer = await upsertPayer(tx, doc.payerId, doc.payer)
  const [remit] = await tx
    .insert(remittances)
    .values({
      payerId: payer.id, trace: doc.trace, paymentAmount: doc.payment, paymentDate: isoDate(doc.paymentDate),
      method: doc.method, fileName, raw: text, issues, importedBy: userId,
    })
    .onConflictDoNothing()
    .returning()
  if (!remit) throw new ImportError(`Remittance ${doc.trace} from ${doc.payer} was already imported.`, 409)

  result.remittances.push({ id: remit.id, payer: payer.name, trace: doc.trace, payment: doc.payment })
  result.claims += doc.claims.length
  const deniedOn = isoDate(doc.paymentDate)
  const appealBy = new Date(Date.parse(deniedOn) + appealWindowDays(payer.name) * 86400000).toISOString().slice(0, 10)

  for (const c of doc.claims) {
    // newest submission of this claim (a corrected claim, frequency 7, wins)
    const [claim] = await tx.select().from(claims).where(eq(claims.patientControl, c.patientControl)).orderBy(desc(claims.submittedAt), desc(claims.id)).limit(1)
    if (claim) result.matched++
    else result.unmatched.push(c.patientControl)
    const lines = claim ? await tx.select().from(claimLines).where(eq(claimLines.claimId, claim.id)).orderBy(claimLines.lineNo) : []

    const [cp] = await tx
      .insert(claimPayments)
      .values({
        remittanceId: remit.id, claimId: claim?.id ?? null, patientControl: c.patientControl, statusCode: c.status,
        charge: c.charge, paid: c.paid, patientResp: c.patientResp, payerClaimId: c.payerClaim, remarks: c.remarks,
      })
      .returning()
    // a reversal (CLP02 22) or a negative adjustment backs out an earlier adjudication: it is not new work
    const reversal = c.status === '22'
    const isWork = (a: { group: string; reason: string; amount: number }) => !reversal && a.amount > 0 && isDenial(a.group, a.reason)
    const denialAdj: { group: string; reason: string; amount: number }[] = []
    const allAdj: { group: string; reason: string; amount: number }[] = []
    for (const a of c.adjustments) {
      await tx.insert(adjustments).values({ claimPaymentId: cp.id, groupCode: a.group, reason: a.reason, amount: a.amount })
      allAdj.push(a)
      if (isWork(a)) denialAdj.push(a)
    }
    const used = new Set<number>()
    for (const s of c.services) {
      const line = matchLine(lines, used, s)
      const [lp] = await tx
        .insert(linePayments)
        .values({
          claimPaymentId: cp.id, claimLineId: line?.id ?? null, procedure: s.procedure, modifiers: s.modifiers,
          charge: s.charge, allowed: s.allowed ?? null, paid: s.paid, remarks: s.remarks,
        })
        .returning()
      for (const a of s.adjustments) {
        await tx.insert(adjustments).values({ claimPaymentId: cp.id, linePaymentId: lp.id, groupCode: a.group, reason: a.reason, amount: a.amount })
        allAdj.push(a)
        if (isWork(a)) denialAdj.push(a)
      }
    }
    await tx.insert(activities).values({
      claimId: claim?.id ?? null, userId, kind: 'remit',
      body: { remittanceId: remit.id, payer: payer.name, paid: c.paid, status: c.status, trace: doc.trace },
    })

    // A claim we were already working (on any submission of it, or before its 837 was on file —
    // found by patient control number): does this remittance resolve it?
    const samePcn = tx.select({ id: claimPayments.id }).from(claimPayments).where(eq(claimPayments.patientControl, c.patientControl))
    const open = await tx.select().from(denials).where(and(inArray(denials.claimPaymentId, samePcn), notInArray(denials.status, ['resolved', 'written_off']))).orderBy(desc(denials.id)).limit(1)
    if (open.length) {
      const d = open[0]
      if (claim && !d.claimId) await tx.update(denials).set({ claimId: claim.id }).where(eq(denials.id, d.id))
      const code = (a: { group: string; reason: string }) => `${a.group}-${a.reason}`
      if (reversal) {
        // the payer took back an earlier payment; the next CLP for the claim says what happens now
        await tx.insert(activities).values({ denialId: d.id, claimId: claim?.id ?? d.claimId, userId, kind: 'note', body: { text: `Payer reversed an earlier adjudication on ${deniedOn}${c.paid ? ` ($${c.paid.toFixed(2)})` : ''}.`, auto: true } })
      } else if (['1', '2', '3'].includes(c.status) && c.paid > 0 && !denialAdj.length) {
        // processed and paid with no denial adjustments left: the work item is done
        const recovered = r2(d.recovered + c.paid)
        await tx.update(denials).set({ status: 'resolved', recovered, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(denials.id, d.id))
        await tx.insert(activities).values({ denialId: d.id, claimId: claim?.id ?? d.claimId, userId, kind: 'status', body: { from: d.status, to: 'resolved', recovered: c.paid, auto: true } })
        result.resolved++
      } else {
        // denied again (CLP02 4 or a new denial adjustment), or processed with nothing paid: still open.
        // A partial payment still counts toward what was recovered.
        const shown = denialAdj.length ? denialAdj : allAdj.filter((a) => a.amount > 0)
        const codes = c.status === '4' || denialAdj.length ? [...new Set([...d.codes, ...shown.map(code)])] : d.codes
        await tx.update(denials).set({ status: 'in_progress', codes, recovered: r2(d.recovered + Math.max(c.paid, 0)), updatedAt: new Date() }).where(eq(denials.id, d.id))
        const what = c.status === '4' || denialAdj.length ? 'Denied again' : 'Processed with no payment'
        await tx.insert(activities).values({ denialId: d.id, claimId: claim?.id ?? d.claimId, userId, kind: 'note', body: { text: `${what} on ${deniedOn}${shown.length ? ` (${shown.map(code).join(', ')})` : ''}${c.paid > 0 ? `; $${c.paid.toFixed(2)} paid` : ''}.`, auto: true } })
      }
      continue
    }
    if (!denialAdj.length) continue

    const top = [...denialAdj].sort((a, b) => b.amount - a.amount)[0]
    const [d] = await tx
      .insert(denials)
      .values({
        claimId: claim?.id ?? null, claimPaymentId: cp.id, payerId: payer.id,
        primaryCode: `${top.group}-${top.reason}`,
        codes: [...new Set(denialAdj.map((a) => `${a.group}-${a.reason}`))],
        category: categoryOf(top.reason),
        amount: r2(denialAdj.reduce((s, a) => s + a.amount, 0)),
        fullDenial: c.paid === 0 && c.status === '4',
        deniedOn, appealBy,
      })
      .returning()
    await tx.insert(activities).values({ denialId: d.id, claimId: claim?.id ?? null, userId, kind: 'denied', body: { codes: d.codes, amount: d.amount, matched: !!claim } })
    result.newDenials++
  }
}
