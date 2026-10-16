// End-to-end API tests against a real Postgres: seed → login → work a denial → reimport.
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../server/app'
import { closeDb, getDb, schema } from '../server/db'
import { seed, DEMO_PASSWORD } from '../server/seed'
import { import835 } from '../server/services/imports'
import { makeClaim, PAYERS, to835, to837 } from '../src/lib/generate'

let cookie = ''
const call = (path: string, init: RequestInit = {}) =>
  app.request(path, { ...init, headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) } })
const post = (path: string, body: unknown) => call(path, { method: 'POST', body: JSON.stringify(body) })
const upload = (path: string, body: string) => call(path, { method: 'POST', body })
const denialsFor = (pcn: string) =>
  getDb().select({ id: schema.denials.id, status: schema.denials.status }).from(schema.denials).innerJoin(schema.claims, eq(schema.claims.id, schema.denials.claimId)).where(eq(schema.claims.patientControl, pcn))

beforeAll(async () => {
  await seed(40)
  const res = await post('/api/auth/login', { email: 'dana@demo.claimslens.dev', password: DEMO_PASSWORD })
  cookie = res.headers.get('set-cookie')!.split(';')[0]
})
afterAll(closeDb)

describe('auth', () => {
  it('rejects anonymous requests and bad passwords', async () => {
    expect((await app.request('/api/kpis')).status).toBe(401)
    expect((await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'dana@demo.claimslens.dev', password: 'wrong' }) })).status).toBe(401)
  })
  it('returns the signed-in user', async () => {
    const me = await (await call('/api/me')).json()
    expect(me.user).toMatchObject({ name: 'Dana Kim', role: 'biller' })
  })
})

describe('worklist and detail', () => {
  it('lists open denials with codes explained', async () => {
    const list = await (await call('/api/denials')).json()
    expect(list.total).toBeGreaterThan(0)
    expect(list.rows[0]).toHaveProperty('title')
    expect(['new', 'in_progress', 'resubmitted', 'appealed']).toContain(list.rows[0].status)
  })
  it('reconciles every submitted line against the remittance', async () => {
    const list = await (await call('/api/denials')).json()
    const det = await (await call(`/api/denials/${list.rows[0].id}`)).json()
    expect(det.recon.length).toBeGreaterThan(0)
    const billed = det.recon.reduce((s: number, l: { billed: number }) => s + l.billed, 0)
    expect(Math.round(billed * 100)).toBe(Math.round(det.claim.totalCharge * 100))
    expect(det.explanation?.plain).toBeTruthy()
  })
})

describe('workflow', () => {
  it('assigns, notes, resubmits and enforces transitions', async () => {
    const list = await (await call('/api/denials?status=new')).json()
    const id = list.rows[0].id
    expect((await post(`/api/denials/${id}/assign`, { ownerId: 1 })).status).toBe(200)
    expect((await post(`/api/denials/${id}/notes`, { text: 'Checking the auth record.' })).status).toBe(200)
    const rs = await (await post(`/api/denials/${id}/resubmit`, {})).json()
    expect(rs.x837).toMatch(/CLM\*[^*]+\*[\d.]+\*\*\*\d+:B:7/) // frequency 7 = replacement
    expect(rs.x837).toMatch(/REF\*F8\*/)
    expect((await post(`/api/denials/${id}/status`, { status: 'new' })).status).toBe(400)
    const det = await (await call(`/api/denials/${id}`)).json()
    expect(det.denial.status).toBe('resubmitted')
    expect(det.history.map((h: { kind: string }) => h.kind)).toEqual(expect.arrayContaining(['assigned', 'note', 'resubmitted']))
  })
  it('drafts an appeal letter with the claim facts', async () => {
    const list = await (await call('/api/denials?status=new')).json()
    const { letter } = await (await post(`/api/denials/${list.rows[0].id}/appeal`, { argument: 'Authorization A-123 was approved.' })).json()
    expect(letter).toContain('Authorization A-123 was approved.')
    expect(letter).toContain(list.rows[0].patientControl)
  })
  it('only lets a manager reopen a closed denial', async () => {
    const list = await (await call('/api/denials?status=new')).json()
    const id = list.rows[0].id
    expect((await post(`/api/denials/${id}/status`, { status: 'resolved', recovered: 10 })).status).toBe(200)
    expect((await post(`/api/denials/${id}/status`, { status: 'in_progress' })).status).toBe(403)
    // resubmitting or appealing must not reopen it either
    expect((await post(`/api/denials/${id}/resubmit`, {})).status).toBe(400)
    expect((await post(`/api/denials/${id}/appeal`, {})).status).toBe(400)
    expect((await (await call(`/api/denials/${id}`)).json()).denial.status).toBe('resolved')
  })
})

describe('imports', () => {
  it('refuses the same 835 twice', async () => {
    const db = getDb()
    const c = makeClaim(4242, { scenario: 'paid', day: new Date() })
    c.id = 'TESTDUP0001'
    expect((await post('/api/import/837', undefined as never)).status).toBe(400)
    await call('/api/import/837', { method: 'POST', body: to837([c]) })
    const text = to835([c], 9999)
    await import835(db, text, null)
    await expect(import835(db, text, null)).rejects.toThrow(/already imported/)
  })
  it('auto-resolves a denial when the corrected claim gets paid', async () => {
    const day = new Date()
    const denied = makeClaim(777, { scenario: 'missingInfo', day })
    denied.id = 'TESTRESOLVE1'
    await call('/api/import/837', { method: 'POST', body: to837([denied]) })
    const first = await (await call('/api/import/835', { method: 'POST', body: to835([denied], 7001) })).json()
    expect(first.newDenials).toBe(1)
    const paid = makeClaim(777, { scenario: 'paid', day, payer: denied.payer })
    paid.id = denied.id
    paid.payerClaimId = denied.payerClaimId + '1'
    const second = await (await call('/api/import/835', { method: 'POST', body: to835([paid], 7002) })).json()
    expect(second.resolved).toBe(1)
  })
  it('keeps a denial open when the next remittance still denies part of the claim', async () => {
    const day = new Date()
    const denied = makeClaim(888, { scenario: 'missingInfo', day })
    denied.id = 'TESTPARTIAL1'
    await upload('/api/import/837', to837([denied]))
    expect((await (await upload('/api/import/835', to835([denied], 7101))).json()).newDenials).toBe(1)
    const partial = makeClaim(888, { scenario: 'bundled', day, payer: denied.payer })
    partial.id = denied.id
    partial.payerClaimId = denied.payerClaimId + '1'
    expect(partial.outcome.lines.some((l) => l.paid > 0)).toBe(true)
    const second = await (await upload('/api/import/835', to835([partial], 7102))).json()
    expect(second.resolved).toBe(0)
    expect((await denialsFor(denied.id)).map((d) => d.status)).toEqual(['in_progress'])
  })
  it('resolves the original denial when an imported corrected claim gets paid', async () => {
    const day = new Date()
    const denied = makeClaim(999, { scenario: 'missingInfo', day })
    denied.id = 'TESTCORRECT1'
    await upload('/api/import/837', to837([denied]))
    await upload('/api/import/835', to835([denied], 7201))
    const [d] = await denialsFor(denied.id)
    const { x837 } = await (await post(`/api/denials/${d.id}/resubmit`, {})).json()
    expect((await (await upload('/api/import/837', x837)).json()).claims).toBe(1) // frequency 7 = a second claims row
    const paid = makeClaim(999, { scenario: 'paid', day, payer: denied.payer })
    paid.id = denied.id
    paid.payerClaimId = denied.payerClaimId + '1'
    expect((await (await upload('/api/import/835', to835([paid], 7202))).json()).resolved).toBe(1)
    expect((await denialsFor(denied.id)).map((x) => x.status)).toEqual(['resolved'])
  })
  it("takes each claim's payer from its own subscriber loop", async () => {
    const day = new Date()
    const [a, b, c] = [0, 0, 1].map((p, n) => makeClaim(5151 + n, { scenario: 'paid', day, payer: PAYERS[p] }))
    ;[a.id, b.id, c.id] = ['TESTPAYER1', 'TESTPAYER2', 'TESTPAYER3']
    // put the second claim under the first claim's subscriber (HL, SBR, NM1*IL, N3, N4, DMG, NM1*PR removed)
    const segs = to837([a, b, c]).split('~\n')
    segs.splice(segs.findIndex((s) => s.startsWith(`CLM*${b.id}*`)) - 7, 7)
    const st = segs.findIndex((s) => s.startsWith('ST*'))
    const se = segs.findIndex((s) => s.startsWith('SE*'))
    segs[se] = `SE*${se - st + 1}*0001`
    expect((await (await upload('/api/import/837', segs.join('~\n'))).json()).claims).toBe(3)
    const { claims, payers } = schema
    const rows = await getDb().select({ pcn: claims.patientControl, payer: payers.code }).from(claims).innerJoin(payers, eq(payers.id, claims.payerId)).where(inArray(claims.patientControl, [a.id, b.id, c.id]))
    expect(Object.fromEntries(rows.map((r) => [r.pcn, r.payer]))).toEqual({ [a.id]: PAYERS[0].id, [b.id]: PAYERS[0].id, [c.id]: PAYERS[1].id })
  })
  it('answers bad uploads and oversized bodies with clean errors', async () => {
    expect((await upload('/api/import/837', 'not an X12 file')).status).toBe(400)
    expect((await upload('/api/import/835', 'x'.repeat(2_000_001))).status).toBe(413)
    expect((await post('/api/auth/login', { email: 'dana@demo.claimslens.dev', password: 'x'.repeat(2_000_001) })).status).toBe(413)
  })
})
