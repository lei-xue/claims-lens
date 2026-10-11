// Read models for the workbench UI.
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, or, sql, sum, type SQL } from 'drizzle-orm'
import { schema, type Db } from '../db'
import { CARC } from './codes'

const { denials, claims, claimLines, claimPayments, linePayments, adjustments, payers, users, activities, remittances, appeals } = schema
const OPEN = ['new', 'in_progress', 'resubmitted', 'appealed'] as const

export type WorklistFilter = {
  status?: string
  payer?: number
  category?: string
  owner?: number | 'me' | 'none'
  age?: '0-30' | '31-60' | '61-90' | '90+'
  q?: string
  sort?: 'age' | 'amount' | 'appealBy'
  page?: number
}

const ageExpr = sql<number>`(current_date - ${denials.deniedOn})`

export async function worklist(db: Db, f: WorklistFilter, me: number) {
  const where: SQL[] = []
  if (f.status === 'open' || !f.status) where.push(inArray(denials.status, [...OPEN]))
  else if (f.status !== 'all') where.push(eq(denials.status, f.status as (typeof OPEN)[number]))
  if (f.payer) where.push(eq(denials.payerId, f.payer))
  if (f.category) where.push(eq(denials.category, f.category))
  if (f.owner === 'me') where.push(eq(denials.ownerId, me))
  else if (f.owner === 'none') where.push(isNull(denials.ownerId))
  else if (typeof f.owner === 'number') where.push(eq(denials.ownerId, f.owner))
  if (f.age) {
    const [lo, hi] = f.age === '90+' ? [91, 100000] : f.age.split('-').map(Number)
    where.push(sql`${ageExpr} between ${lo} and ${hi}`)
  }
  if (f.q) {
    const like = `%${f.q.trim()}%`
    where.push(or(ilike(claims.patientControl, like), ilike(claims.patientName, like), ilike(denials.primaryCode, like))!)
  }
  const order = f.sort === 'amount' ? [desc(denials.amount)] : f.sort === 'appealBy' ? [asc(denials.appealBy)] : [desc(ageExpr), desc(denials.amount)]
  const pageSize = 25
  const page = Math.max(1, f.page ?? 1)
  const cond = where.length ? and(...where) : undefined
  const rows = await db
    .select({
      id: denials.id, status: denials.status, primaryCode: denials.primaryCode, codes: denials.codes, category: denials.category,
      amount: denials.amount, recovered: denials.recovered, deniedOn: denials.deniedOn, appealBy: denials.appealBy, age: ageExpr,
      fullDenial: denials.fullDenial, patientControl: claims.patientControl, patient: claims.patientName, serviceDate: claims.serviceDate,
      payer: payers.name, payerId: payers.id, ownerId: users.id, owner: users.name,
    })
    .from(denials)
    .leftJoin(claims, eq(claims.id, denials.claimId))
    .leftJoin(payers, eq(payers.id, denials.payerId))
    .leftJoin(users, eq(users.id, denials.ownerId))
    .where(cond)
    .orderBy(...order)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const [{ total, amount }] = await db
    .select({ total: count(), amount: sum(denials.amount) })
    .from(denials)
    .leftJoin(claims, eq(claims.id, denials.claimId))
    .where(cond)
  return { rows: rows.map((r) => ({ ...r, title: CARC.get(r.primaryCode.split('-')[1])?.title ?? '' })), total, amount: Number(amount ?? 0), page, pageSize }
}

export async function denialDetail(db: Db, id: number) {
  const [d] = await db
    .select({ d: denials, payer: payers.name, owner: users.name })
    .from(denials)
    .leftJoin(payers, eq(payers.id, denials.payerId))
    .leftJoin(users, eq(users.id, denials.ownerId))
    .where(eq(denials.id, id))
  if (!d) return null
  const [claim] = d.d.claimId ? await db.select().from(claims).where(eq(claims.id, d.d.claimId)) : []
  const lines = claim ? await db.select().from(claimLines).where(eq(claimLines.claimId, claim.id)).orderBy(claimLines.lineNo) : []
  const [cp] = await db.select({ cp: claimPayments, trace: remittances.trace, paymentDate: remittances.paymentDate, remittanceId: remittances.id }).from(claimPayments).innerJoin(remittances, eq(remittances.id, claimPayments.remittanceId)).where(eq(claimPayments.id, d.d.claimPaymentId))
  const lps = await db.select().from(linePayments).where(eq(linePayments.claimPaymentId, d.d.claimPaymentId)).orderBy(linePayments.id)
  const adjs = await db.select().from(adjustments).where(eq(adjustments.claimPaymentId, d.d.claimPaymentId))
  const history = await db
    .select({ id: activities.id, kind: activities.kind, body: activities.body, at: activities.at, user: users.name })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.userId))
    .where(or(eq(activities.denialId, id), claim ? eq(activities.claimId, claim.id) : sql`false`))
    .orderBy(asc(activities.at), asc(activities.id))
  const [appeal] = await db.select().from(appeals).where(eq(appeals.denialId, id)).orderBy(desc(appeals.createdAt)).limit(1)

  // reconciliation: one row per submitted line, with what the payer did to it
  const recon = lines.map((l) => {
    const lp = lps.find((x) => x.claimLineId === l.id)
    return {
      lineId: l.id, lineNo: l.lineNo, procedure: l.procedure, modifiers: l.modifiers, units: l.units, billed: l.charge,
      allowed: lp?.allowed ?? null, paid: lp?.paid ?? null, remarks: lp?.remarks ?? [],
      adjustments: lp ? adjs.filter((a) => a.linePaymentId === lp.id).map((a) => ({ group: a.groupCode, reason: a.reason, amount: a.amount })) : [],
      missing: !lp,
    }
  })
  const carc = CARC.get(d.d.primaryCode.split('-')[1])
  return {
    denial: { ...d.d, payer: d.payer, owner: d.owner },
    claim: claim ?? null,
    payment: cp ? { ...cp.cp, trace: cp.trace, paymentDate: cp.paymentDate, remittanceId: cp.remittanceId } : null,
    claimAdjustments: adjs.filter((a) => !a.linePaymentId).map((a) => ({ group: a.groupCode, reason: a.reason, amount: a.amount })),
    recon,
    explanation: carc ? { title: carc.title, plain: carc.plain, causes: (carc as unknown as { causes: string[] }).causes, fix: carc.fix, owner: carc.owner } : null,
    history,
    appeal: appeal?.letter ?? null,
  }
}

export async function kpis(db: Db) {
  const [open] = await db.select({ n: count(), amt: sum(denials.amount) }).from(denials).where(inArray(denials.status, [...OPEN]))
  const [rec] = await db.select({ amt: sum(denials.recovered) }).from(denials).where(and(eq(denials.status, 'resolved'), gte(denials.resolvedAt, sql`current_date - 30`)))
  const [avg] = await db.select({ d: sql<number>`avg(extract(epoch from (${denials.resolvedAt} - ${denials.deniedOn}::timestamptz)) / 86400)` }).from(denials).where(and(eq(denials.status, 'resolved'), gte(denials.resolvedAt, sql`current_date - 90`)))
  const [rate] = await db
    .select({
      claims: sql<number>`count(distinct ${claimPayments.claimId})`,
      denied: sql<number>`count(distinct ${denials.claimId})`,
    })
    .from(claimPayments)
    .innerJoin(remittances, eq(remittances.id, claimPayments.remittanceId))
    .leftJoin(denials, eq(denials.claimPaymentId, claimPayments.id))
    .where(gte(remittances.paymentDate, sql`current_date - 90`))
  const [overdue] = await db.select({ n: count() }).from(denials).where(and(inArray(denials.status, [...OPEN]), sql`${denials.appealBy} < current_date + 14`))
  return {
    openCount: open.n, openAmount: Number(open.amt ?? 0), recovered30d: Number(rec.amt ?? 0),
    avgDaysToResolve: avg.d ? Number(avg.d) : null, denialRate90d: rate.claims ? Number(rate.denied) / Number(rate.claims) : 0,
    appealDeadlineSoon: overdue.n,
  }
}

export async function lookups(db: Db) {
  const ps = await db.select({ id: payers.id, name: payers.name }).from(payers).orderBy(payers.name)
  const us = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).orderBy(users.name)
  const cats = await db.selectDistinct({ c: denials.category }).from(denials)
  return { payers: ps, users: us, categories: cats.map((c) => c.c).sort() }
}

export async function analytics(db: Db) {
  const byReason = await db
    .select({ code: denials.primaryCode, n: count(), amount: sum(denials.amount), recovered: sum(denials.recovered) })
    .from(denials).groupBy(denials.primaryCode).orderBy(desc(sum(denials.amount)))
  const byPayer = await db
    .select({ payer: payers.name, claims: sql<number>`count(distinct ${claimPayments.id})`, denied: sql<number>`count(distinct ${denials.id})` })
    .from(claimPayments)
    .innerJoin(remittances, eq(remittances.id, claimPayments.remittanceId))
    .innerJoin(payers, eq(payers.id, remittances.payerId))
    .leftJoin(denials, eq(denials.claimPaymentId, claimPayments.id))
    .groupBy(payers.name)
  const byMonth = await db
    .select({ month: sql<string>`to_char(${remittances.paymentDate}, 'YYYY-MM')`, claims: sql<number>`count(distinct ${claimPayments.id})`, denied: sql<number>`count(distinct ${denials.id})`, deniedAmt: sql<number>`coalesce(sum(${denials.amount}),0)` })
    .from(claimPayments)
    .innerJoin(remittances, eq(remittances.id, claimPayments.remittanceId))
    .leftJoin(denials, eq(denials.claimPaymentId, claimPayments.id))
    .groupBy(sql`1`).orderBy(sql`1`)
  const byStatus = await db.select({ status: denials.status, n: count(), amount: sum(denials.amount), recovered: sum(denials.recovered) }).from(denials).groupBy(denials.status)
  const byOwner = await db
    .select({ owner: users.name, open: sql<number>`count(*) filter (where ${denials.status} in ('new','in_progress','resubmitted','appealed'))`, resolved: sql<number>`count(*) filter (where ${denials.status} = 'resolved')`, recovered: sum(denials.recovered) })
    .from(denials).innerJoin(users, eq(users.id, denials.ownerId)).groupBy(users.name)
  const num = (x: unknown) => Number(x ?? 0)
  return {
    byReason: byReason.map((r) => ({ code: r.code, title: CARC.get(r.code.split('-')[1])?.title ?? '', owner: CARC.get(r.code.split('-')[1])?.owner ?? 'other', n: r.n, amount: num(r.amount), recovered: num(r.recovered) })),
    byPayer: byPayer.map((r) => ({ payer: r.payer, claims: num(r.claims), denied: num(r.denied) })),
    byMonth: byMonth.map((r) => ({ month: r.month, claims: num(r.claims), denied: num(r.denied), deniedAmt: num(r.deniedAmt) })),
    byStatus: byStatus.map((r) => ({ status: r.status, n: r.n, amount: num(r.amount), recovered: num(r.recovered) })),
    byOwner: byOwner.map((r) => ({ owner: r.owner, open: num(r.open), resolved: num(r.resolved), recovered: num(r.recovered) })),
  }
}

export async function remittanceList(db: Db) {
  return db
    .select({
      id: remittances.id, trace: remittances.trace, payer: payers.name, amount: remittances.paymentAmount, date: remittances.paymentDate,
      method: remittances.method, importedAt: remittances.importedAt, fileName: remittances.fileName,
      claims: sql<number>`(select count(*) from claim_payments cp where cp.remittance_id = ${remittances.id})`,
      unmatched: sql<number>`(select count(*) from claim_payments cp where cp.remittance_id = ${remittances.id} and cp.claim_id is null)`,
      denials: sql<number>`(select count(*) from denials d join claim_payments cp on cp.id = d.claim_payment_id where cp.remittance_id = ${remittances.id})`,
      issues: remittances.issues,
    })
    .from(remittances)
    .leftJoin(payers, eq(payers.id, remittances.payerId))
    .orderBy(desc(remittances.paymentDate), desc(remittances.id))
    .limit(200)
}

export async function remittanceRaw(db: Db, id: number) {
  const [r] = await db.select({ raw: remittances.raw }).from(remittances).where(eq(remittances.id, id))
  return r?.raw ?? null
}

export const OPEN_STATUSES = OPEN
