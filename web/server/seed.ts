// Demo data: ~200 days of fictional claims sent as 837P files and paid by 835 files,
// both going through the real import pipeline, then a plausible history of work on older denials.
// Re-running wipes everything and rebuilds (used for the nightly demo reset).
import 'dotenv/config'
import { eq, sql } from 'drizzle-orm'
import { makeClaim, PAYERS, rng, to835, to837, type SynthClaim } from '../src/lib/generate'
import { closeDb, getDb, schema } from './db'
import { hashPassword } from './services/auth'
import { import835, import837 } from './services/imports'
import { runMigrations } from './migrate'

const { users, denials, activities } = schema
const DAY = 86400000
export const DEMO_PASSWORD = 'demo1234!'
export const DEMO_USERS = [
  { email: 'dana@demo.claimslens.dev', name: 'Dana Kim', role: 'biller' as const },
  { email: 'jordan@demo.claimslens.dev', name: 'Jordan Lee', role: 'biller' as const },
  { email: 'alex@demo.claimslens.dev', name: 'Alex Morgan', role: 'manager' as const },
]
const NOTES = [
  'Called payer — rep confirmed the claim needs a corrected submission.',
  'Pulled the visit note; documentation supports the service.',
  'Authorization was on file — attaching the approval letter to the appeal.',
  'Eligibility re-verified in the payer portal; member was active on DOS.',
  'Coding reviewed the modifier usage with the provider.',
  'Patient has secondary coverage — updated COB and rebilled.',
]

const ymd = (d: Date) => d.toISOString().slice(0, 10)

export async function seed(days = 200) {
  const db = getDb()
  await runMigrations()
  await db.execute(sql`truncate appeals, activities, denials, adjustments, line_payments, claim_payments, remittances, claim_lines, claims, payers, sessions, users restart identity cascade`)

  const hash = await hashPassword(DEMO_PASSWORD)
  const team = await db.insert(users).values(DEMO_USERS.map((u) => ({ ...u, passwordHash: hash }))).returning()

  // claims: a working practice sends ~8 claims per weekday
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const r = rng(20261011)
  const all: SynthClaim[] = []
  let seq = 0
  for (let back = days; back >= 1; back--) {
    const day = new Date(today.getTime() - back * DAY)
    if (day.getDay() === 0 || day.getDay() === 6) continue
    const n = 5 + Math.floor(r() * 7)
    for (let i = 0; i < n; i++) all.push(makeClaim(900000 + seq++, { day, payer: PAYERS[Math.floor(r() * PAYERS.length)] }))
  }
  // fix ids so they read like real patient-control numbers in date order
  all.forEach((c, i) => (c.id = `MGFM${c.serviceDate.slice(2, 6)}${String(i + 1).padStart(5, '0')}`))

  // 837 batches: one file per service day
  const byDay = new Map<string, SynthClaim[]>()
  for (const c of all) byDay.set(c.serviceDate, [...(byDay.get(c.serviceDate) ?? []), c])
  let ctrl = 1000
  for (const batch of byDay.values()) await import837(db, to837(batch, ++ctrl), team[2].id)

  // 835 files: one per payer per remittance date, only for dates already in the past
  const remits = new Map<string, SynthClaim[]>()
  for (const c of all) {
    const paid = new Date(Number(c.paidDate.slice(0, 4)), Number(c.paidDate.slice(4, 6)) - 1, Number(c.paidDate.slice(6, 8)))
    if (paid > today) continue
    const key = `${c.payer.id}|${c.paidDate}`
    remits.set(key, [...(remits.get(key) ?? []), c])
  }
  let imported = 0
  for (const [, batch] of [...remits].sort((a, b) => a[0].split('|')[1].localeCompare(b[0].split('|')[1]))) {
    await import835(db, to835(batch, 5000 + imported++), null, `${batch[0].payer.id}-${batch[0].paidDate}.835`)
  }

  // history of work on the denials, older ones further along
  const ds = await db.select().from(denials)
  const billers = team.filter((u) => u.role === 'biller')
  for (const d of ds) {
    const age = Math.floor((today.getTime() - Date.parse(d.deniedOn)) / DAY)
    const x = r()
    const owner = r() < 0.85 ? billers[Math.floor(r() * billers.length)] : team[2]
    const at = (daysAfter: number) => new Date(Date.parse(d.deniedOn) + Math.min(daysAfter, Math.max(age - 0.2, 0.1)) * DAY + r() * 6 * 3600000)
    const acts: (typeof activities.$inferInsert)[] = []
    let status: typeof d.status = 'new'
    let recovered = 0
    let resolvedAt: Date | null = null
    const assignNow = age > 2 && (age > 20 || x > (age < 7 ? 0.6 : 0.1))
    if (assignNow) {
      status = 'in_progress'
      acts.push({ denialId: d.id, claimId: d.claimId, userId: team[2].id, kind: 'assigned', body: { from: null, to: owner.id }, at: at(1 + r() * 2) })
      if (r() < 0.6) acts.push({ denialId: d.id, claimId: d.claimId, userId: owner.id, kind: 'note', body: { text: NOTES[Math.floor(r() * NOTES.length)] }, at: at(3 + r() * 4) })
    }
    if (assignNow && age > 12 && r() < (age > 60 ? 0.97 : 0.75)) {
      const appeal = /50|197|27/.test(d.primaryCode) && r() < 0.6
      status = appeal ? 'appealed' : 'resubmitted'
      acts.push({ denialId: d.id, claimId: d.claimId, userId: owner.id, kind: appeal ? 'appeal' : 'resubmitted', body: {}, at: at(8 + r() * 6) })
      if (age > 35 && r() < (age > 60 ? 0.96 : 0.7)) {
        const won = r() < (appeal ? 0.62 : 0.85)
        resolvedAt = at(25 + r() * 20)
        if (won) {
          status = 'resolved'
          recovered = Math.round(d.amount * (0.55 + r() * 0.45) * 100) / 100
        } else status = 'written_off'
        acts.push({ denialId: d.id, claimId: d.claimId, userId: owner.id, kind: 'status', body: { from: appeal ? 'appealed' : 'resubmitted', to: status, recovered: won ? recovered : undefined }, at: resolvedAt })
      }
    }
    if (acts.length) await db.insert(activities).values(acts)
    await db
      .update(denials)
      .set({ status, ownerId: assignNow ? owner.id : null, recovered, resolvedAt, createdAt: new Date(d.deniedOn), updatedAt: acts.at(-1)?.at ?? new Date(d.deniedOn) })
      .where(eq(denials.id, d.id))
  }
  // backdate the import activities to the day each file arrived
  await db.execute(sql`update activities a set at = (r.payment_date + time '09:00') from remittances r where a.kind in ('remit','denied') and ((a.body->>'remittanceId')::int = r.id or a.denial_id in (select d.id from denials d join claim_payments cp on cp.id = d.claim_payment_id where cp.remittance_id = r.id and a.kind = 'denied'))`)
  await db.execute(sql`update activities a set at = (c.service_date + time '17:00') from claims c where a.claim_id = c.id and a.kind = 'submitted'`)
  await db.execute(sql`update remittances set imported_at = payment_date + time '09:00'`)
  await db.execute(sql`update claims set submitted_at = service_date + time '17:00'`)
  return { claims: all.length, remittances: imported, denials: ds.length, asOf: ymd(today) }
}

if (process.argv[1]?.match(/seed\.(ts|c?js)$/)) {
  seed()
    .then((s) => console.log('seeded', s))
    .catch((e) => {
      console.error(e)
      process.exitCode = 1
    })
    .finally(closeDb)
}
