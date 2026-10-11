// Importing 837P claims and 835 remittances: parse with the same library the browser uses,
// store everything, match remittances back to submitted claims and open denial work items.
import { and, desc, eq, notInArray } from 'drizzle-orm'
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
  const r = interpret(text)
  if (r.doc?.type !== '837P') throw new ImportError('This file is not an 837P professional claim.')
  const errors = r.issues.filter((i) => i.level === 'error')
  if (errors.length) throw new ImportError(`The 837P has ${errors.length} error(s): ${errors[0].message}`)
  const doc = r.doc as Submission
  // NM1*PR carries the payer id in NM109; interpret() keeps the name, so read ids from segments
  const payerIds = r.segments.filter((s) => s.id === 'NM1' && s.elements[0] === 'PR').map((s) => s.elements[8])
  let inserted = 0
  let duplicates = 0
  await db.transaction(async (tx) => {
    for (const [i, c] of doc.claims.entries()) {
      const payer = await upsertPayer(tx, payerIds[i] ?? '', c.payer)
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
      await tx.insert(claimLines).values(
        c.lines.map((l, n) => ({
          claimId: row.id, lineNo: n + 1, procedure: l.procedure, modifiers: l.modifiers, charge: l.charge,
          units: Number(l.units) || 1, dxPointers: l.pointers.map(Number),
        })),
      )
      await tx.insert(activities).values({ claimId: row.id, userId, kind: c.frequency === '7' ? 'resubmitted' : 'submitted', body: { charge: c.charge } })
    }
  })
  return { claims: inserted, duplicates, issues: r.issues }
}

export type RemitImportResult = {
  remittanceId: number
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
  if (r.doc?.type !== '835') throw new ImportError('This file is not an 835 remittance.')
  const doc = r.doc as Remit
  const issues = r.issues.map(({ level, message }) => ({ level, message }))

  return db.transaction(async (tx) => {
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

    const result: RemitImportResult = {
      remittanceId: remit.id, payer: payer.name, payment: doc.payment, claims: doc.claims.length,
      matched: 0, unmatched: [], newDenials: 0, resolved: 0, issues,
    }
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
      const denialAdj: { group: string; reason: string; amount: number }[] = []
      for (const a of c.adjustments) {
        await tx.insert(adjustments).values({ claimPaymentId: cp.id, groupCode: a.group, reason: a.reason, amount: a.amount })
        if (isDenial(a.group, a.reason)) denialAdj.push(a)
      }
      const used = new Set<number>()
      for (const s of c.services) {
        const line = lines.find((l) => !used.has(l.id) && l.procedure === s.procedure && l.modifiers.join() === s.modifiers.join()) ?? lines.find((l) => !used.has(l.id) && l.procedure === s.procedure)
        if (line) used.add(line.id)
        const [lp] = await tx
          .insert(linePayments)
          .values({
            claimPaymentId: cp.id, claimLineId: line?.id ?? null, procedure: s.procedure, modifiers: s.modifiers,
            charge: s.charge, allowed: s.allowed ?? null, paid: s.paid, remarks: s.remarks,
          })
          .returning()
        for (const a of s.adjustments) {
          await tx.insert(adjustments).values({ claimPaymentId: cp.id, linePaymentId: lp.id, groupCode: a.group, reason: a.reason, amount: a.amount })
          if (isDenial(a.group, a.reason)) denialAdj.push(a)
        }
      }
      await tx.insert(activities).values({
        claimId: claim?.id ?? null, userId, kind: 'remit',
        body: { remittanceId: remit.id, payer: payer.name, paid: c.paid, status: c.status, trace: doc.trace },
      })

      // A claim we were already working: does this remittance resolve it?
      const open = claim
        ? await tx.select().from(denials).where(and(eq(denials.claimId, claim.id), notInArray(denials.status, ['resolved', 'written_off']))).limit(1)
        : []
      if (open.length) {
        const d = open[0]
        if (!denialAdj.length || c.paid > 0) {
          const recovered = r2(d.recovered + c.paid)
          await tx.update(denials).set({ status: 'resolved', recovered, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(denials.id, d.id))
          await tx.insert(activities).values({ denialId: d.id, claimId: claim!.id, userId, kind: 'status', body: { from: d.status, to: 'resolved', recovered: c.paid, auto: true } })
          result.resolved++
        } else {
          await tx.update(denials).set({ status: 'in_progress', updatedAt: new Date() }).where(eq(denials.id, d.id))
          await tx.insert(activities).values({ denialId: d.id, claimId: claim!.id, userId, kind: 'note', body: { text: `Denied again on ${deniedOn} (${denialAdj.map((a) => `${a.group}-${a.reason}`).join(', ')}).`, auto: true } })
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
    return result
  })
}
