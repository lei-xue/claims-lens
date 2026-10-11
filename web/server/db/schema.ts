import { sql } from 'drizzle-orm'
import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' })

export const roleEnum = pgEnum('role', ['biller', 'manager'])
export const denialStatusEnum = pgEnum('denial_status', ['new', 'in_progress', 'resubmitted', 'appealed', 'resolved', 'written_off'])

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull().default('biller'),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // sha256 of the cookie token
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export const payers = pgTable('payers', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
})

/** A submitted professional claim (from an 837P). */
export const claims = pgTable(
  'claims',
  {
    id: serial('id').primaryKey(),
    patientControl: text('patient_control').notNull(),
    payerId: integer('payer_id').references(() => payers.id),
    patientName: text('patient_name').notNull(),
    memberId: text('member_id').notNull(),
    serviceDate: date('service_date').notNull(),
    pos: text('pos').notNull().default('11'),
    diagnoses: text('diagnoses').array().notNull().default(sql`'{}'`),
    totalCharge: money('total_charge').notNull(),
    frequency: text('frequency').notNull().default('1'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('claims_pcn_freq').on(t.patientControl, t.frequency)],
)

export const claimLines = pgTable('claim_lines', {
  id: serial('id').primaryKey(),
  claimId: integer('claim_id').notNull().references(() => claims.id, { onDelete: 'cascade' }),
  lineNo: integer('line_no').notNull(),
  procedure: text('procedure').notNull(),
  modifiers: text('modifiers').array().notNull().default(sql`'{}'`),
  charge: money('charge').notNull(),
  units: integer('units').notNull().default(1),
  dxPointers: integer('dx_pointers').array().notNull().default(sql`'{}'`),
})

/** One imported 835 file (one payment / one payer). */
export const remittances = pgTable(
  'remittances',
  {
    id: serial('id').primaryKey(),
    payerId: integer('payer_id').references(() => payers.id),
    trace: text('trace').notNull(),
    paymentAmount: money('payment_amount').notNull(),
    paymentDate: date('payment_date').notNull(),
    method: text('method').notNull(),
    fileName: text('file_name'),
    raw: text('raw').notNull(),
    issues: jsonb('issues').$type<{ level: string; message: string }[]>().notNull().default([]),
    importedBy: integer('imported_by').references(() => users.id),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('remittances_trace').on(t.payerId, t.trace)],
)

/** A CLP loop: how the payer adjudicated one claim. claimId is null when no submitted claim matched. */
export const claimPayments = pgTable(
  'claim_payments',
  {
    id: serial('id').primaryKey(),
    remittanceId: integer('remittance_id').notNull().references(() => remittances.id, { onDelete: 'cascade' }),
    claimId: integer('claim_id').references(() => claims.id),
    patientControl: text('patient_control').notNull(),
    statusCode: text('status_code').notNull(),
    charge: money('charge').notNull(),
    paid: money('paid').notNull(),
    patientResp: money('patient_resp').notNull(),
    payerClaimId: text('payer_claim_id').notNull(),
    remarks: text('remarks').array().notNull().default(sql`'{}'`),
  },
  (t) => [index('claim_payments_claim').on(t.claimId)],
)

/** An SVC loop, matched back to the submitted line when possible. */
export const linePayments = pgTable('line_payments', {
  id: serial('id').primaryKey(),
  claimPaymentId: integer('claim_payment_id').notNull().references(() => claimPayments.id, { onDelete: 'cascade' }),
  claimLineId: integer('claim_line_id').references(() => claimLines.id),
  procedure: text('procedure').notNull(),
  modifiers: text('modifiers').array().notNull().default(sql`'{}'`),
  charge: money('charge').notNull(),
  allowed: money('allowed'),
  paid: money('paid').notNull(),
  remarks: text('remarks').array().notNull().default(sql`'{}'`),
})

export const adjustments = pgTable('adjustments', {
  id: serial('id').primaryKey(),
  claimPaymentId: integer('claim_payment_id').notNull().references(() => claimPayments.id, { onDelete: 'cascade' }),
  linePaymentId: integer('line_payment_id').references(() => linePayments.id, { onDelete: 'cascade' }),
  groupCode: text('group_code').notNull(),
  reason: text('reason').notNull(),
  amount: money('amount').notNull(),
})

/** Work item: one denied claim payment (all its denial adjustments rolled up). */
export const denials = pgTable(
  'denials',
  {
    id: serial('id').primaryKey(),
    claimId: integer('claim_id').references(() => claims.id),
    claimPaymentId: integer('claim_payment_id').notNull().unique().references(() => claimPayments.id, { onDelete: 'cascade' }),
    payerId: integer('payer_id').references(() => payers.id),
    primaryCode: text('primary_code').notNull(), // e.g. CO-197, the largest denial adjustment
    codes: text('codes').array().notNull().default(sql`'{}'`),
    category: text('category').notNull(),
    amount: money('amount').notNull(),
    recovered: money('recovered').notNull().default(0),
    status: denialStatusEnum('status').notNull().default('new'),
    ownerId: integer('owner_id').references(() => users.id),
    fullDenial: boolean('full_denial').notNull(),
    deniedOn: date('denied_on').notNull(),
    appealBy: date('appeal_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('denials_status').on(t.status), index('denials_owner').on(t.ownerId)],
)

export const activities = pgTable(
  'activities',
  {
    id: serial('id').primaryKey(),
    denialId: integer('denial_id').references(() => denials.id, { onDelete: 'cascade' }),
    claimId: integer('claim_id').references(() => claims.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id),
    kind: text('kind').notNull(), // imported | matched | assigned | status | note | resubmitted | appeal
    body: jsonb('body').$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('activities_denial').on(t.denialId)],
)

export const appeals = pgTable('appeals', {
  id: serial('id').primaryKey(),
  denialId: integer('denial_id').notNull().references(() => denials.id, { onDelete: 'cascade' }),
  letter: text('letter').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
