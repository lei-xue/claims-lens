// End-to-end API tests against a real Postgres: seed → login → work a denial → reimport.
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../server/app'
import { closeDb, getDb, schema } from '../server/db'
import { seed, DEMO_PASSWORD } from '../server/seed'
import { import835 } from '../server/services/imports'
import { makeClaim, PAYERS, to835, to837 } from '../src/lib/generate'
import { claim837, interchange, remit835, remitBody } from './fixtures'

let cookie = ''
const call = (path: string, init: RequestInit = {}) =>
  app.request(path, { ...init, headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) } })
const post = (path: string, body: unknown) => call(path, { method: 'POST', body: JSON.stringify(body) })
const upload = (path: string, body: string) => call(path, { method: 'POST', body })
const denialsFor = (pcn: string) =>
  getDb().select({ id: schema.denials.id, status: schema.denials.status, recovered: schema.denials.recovered }).from(schema.denials).innerJoin(schema.claims, eq(schema.claims.id, schema.denials.claimId)).where(eq(schema.claims.patientControl, pcn))

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
    const after = await denialsFor(denied.id)
    expect(after.map((d) => d.status)).toEqual(['in_progress'])
    expect(after[0].recovered).toBeGreaterThan(0)
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
    expect((await post('/api/auth/login', { email: 'dana@demo.claimslens.dev', password: 'x'.repeat(2_100_000) })).status).toBe(413)
  })
})

describe('remittance files with several transactions', () => {
  it('creates one remittance per ST/SE transaction', async () => {
    await upload('/api/import/837', claim837('MULTI1', [
      { pcn: 'TESTMULTI1', payerId: 'AAA01', payerName: 'ALPHA PLAN', lines: [{ code: '99213', charge: 100 }] },
      { pcn: 'TESTMULTI2', payerId: 'BBB02', payerName: 'BETA PLAN', lines: [{ code: '99214', charge: 200 }] },
    ]))
    const text = interchange('835', [
      remitBody({ payerId: 'AAA01', payerName: 'ALPHA PLAN', trace: 'TMULTIA', claims: [{ pcn: 'TESTMULTI1', status: '1', charge: 100, paid: 70, cas: ['CO*45*30'] }] }),
      remitBody({ payerId: 'BBB02', payerName: 'BETA PLAN', trace: 'TMULTIB', claims: [{ pcn: 'TESTMULTI2', status: '4', charge: 200, paid: 0, cas: ['CO*197*200'] }] }),
    ], { ctrl: 4711 })
    const res = await (await upload('/api/import/835', text)).json()
    expect(res).toMatchObject({ claims: 2, matched: 2, newDenials: 1, payment: 70 })
    expect(res.remittances.map((x: { trace: string; payment: number }) => [x.trace, x.payment])).toEqual([['TMULTIA', 70], ['TMULTIB', 0]])
    const { remittances, payers } = schema
    const rows = await getDb().select({ trace: remittances.trace, amount: remittances.paymentAmount, payer: payers.code }).from(remittances).innerJoin(payers, eq(payers.id, remittances.payerId)).where(inArray(remittances.trace, ['TMULTIA', 'TMULTIB'])).orderBy(remittances.trace)
    expect(rows).toEqual([{ trace: 'TMULTIA', amount: 70, payer: 'AAA01' }, { trace: 'TMULTIB', amount: 0, payer: 'BBB02' }])
    // the whole file is refused if it was already imported
    expect((await upload('/api/import/835', text)).status).toBe(409)
  })
})

describe('closing the loop on later remittances', () => {
  const payer = { payerId: 'AAA01', payerName: 'ALPHA PLAN' }
  const denialOf = async (pcn: string) => {
    const { denials, claimPayments } = schema
    return getDb().select({ id: denials.id, status: denials.status, recovered: denials.recovered, amount: denials.amount, claimId: denials.claimId, codes: denials.codes }).from(denials).innerJoin(claimPayments, eq(claimPayments.id, denials.claimPaymentId)).where(eq(claimPayments.patientControl, pcn)).orderBy(denials.id)
  }

  it('does not auto-resolve on a re-denial or a reversal, only on a real payment', async () => {
    const pcn = 'TESTLOOP1'
    await upload('/api/import/837', claim837('LOOP1', [{ pcn, ...payer, lines: [{ code: '99214', charge: 200 }] }]))
    const r1 = await (await upload('/api/import/835', remit835({ ...payer, trace: 'TLOOP1', claims: [{ pcn, status: '4', charge: 200, paid: 0, cas: ['CO*16*200'] }] }))).json()
    expect(r1.newDenials).toBe(1)
    // re-denied, this time as patient responsibility (not a "denial" adjustment by group)
    const r2 = await (await upload('/api/import/835', remit835({ ...payer, trace: 'TLOOP2', claims: [{ pcn, status: '4', charge: 200, paid: 0, pr: 200, cas: ['PR*204*200'] }] }))).json()
    expect(r2).toMatchObject({ resolved: 0, newDenials: 0 })
    let [d] = await denialOf(pcn)
    expect(d).toMatchObject({ status: 'in_progress', recovered: 0 })
    expect(d.codes).toEqual(['CO-16', 'PR-204'])
    // a reversal of an earlier payment (negative paid) neither resolves nor counts as recovered
    const r3 = await (await upload('/api/import/835', remit835({ ...payer, trace: 'TLOOP3', claims: [{ pcn, status: '22', charge: -200, paid: -80, cas: ['CO*45*-120'] }] }))).json()
    expect(r3).toMatchObject({ resolved: 0, newDenials: 0 })
    ;[d] = await denialOf(pcn)
    expect(d).toMatchObject({ status: 'in_progress', recovered: 0 })
    // processed and paid: resolves
    const r4 = await (await upload('/api/import/835', remit835({ ...payer, trace: 'TLOOP4', claims: [{ pcn, status: '1', charge: 200, paid: 80, cas: ['CO*45*120'] }] }))).json()
    expect(r4.resolved).toBe(1)
    expect(await denialOf(pcn)).toMatchObject([{ status: 'resolved', recovered: 80 }])
  })

  it('tracks a denial that arrived before its 837 and links it once the claim is imported', async () => {
    const pcn = 'TESTORPHAN1'
    const deny = (trace: string) => remit835({ ...payer, trace, claims: [{ pcn, status: '4', charge: 150, paid: 0, segments: ['SVC*HC:99214*150*0**1', 'CAS*CO*197*150'] }] })
    const r1 = await (await upload('/api/import/835', deny('TORPH1'))).json()
    expect(r1).toMatchObject({ newDenials: 1, unmatched: [pcn] })
    // the payer denies it again before the 837 is on file: same work item, no duplicate
    expect((await (await upload('/api/import/835', deny('TORPH2'))).json()).newDenials).toBe(0)
    expect(await denialOf(pcn)).toMatchObject([{ status: 'in_progress', claimId: null }])
    // importing the claim links the orphan payments and the denial to it
    await upload('/api/import/837', claim837('ORPH1', [{ pcn, ...payer, lines: [{ code: '99214', charge: 150 }] }]))
    const [claim] = await getDb().select().from(schema.claims).where(eq(schema.claims.patientControl, pcn))
    const [d] = await denialOf(pcn)
    expect(d.claimId).toBe(claim.id)
    const cps = await getDb().select({ claimId: schema.claimPayments.claimId }).from(schema.claimPayments).where(eq(schema.claimPayments.patientControl, pcn))
    expect(cps.map((x) => x.claimId)).toEqual([claim.id, claim.id])
    expect((await (await call(`/api/denials/${d.id}`)).json()).recon).toMatchObject([{ procedure: '99214', missing: false, paid: 0, adjustments: [{ group: 'CO', reason: '197', amount: 150 }] }])
    // and the payment that follows resolves it
    const r3 = await (await upload('/api/import/835', remit835({ ...payer, trace: 'TORPH3', claims: [{ pcn, status: '1', charge: 150, paid: 90, cas: ['CO*45*60'] }] }))).json()
    expect(r3.resolved).toBe(1)
    expect(await denialOf(pcn)).toMatchObject([{ status: 'resolved', recovered: 90 }])
  })

  it('resolves an orphan denial when the claim is paid even if its 837 never arrives', async () => {
    const pcn = 'TESTORPHAN2'
    await upload('/api/import/835', remit835({ ...payer, trace: 'TORPH21', claims: [{ pcn, status: '4', charge: 150, paid: 0, cas: ['CO*16*150'] }] }))
    const r = await (await upload('/api/import/835', remit835({ ...payer, trace: 'TORPH22', claims: [{ pcn, status: '1', charge: 150, paid: 90, cas: ['CO*45*60'] }] }))).json()
    expect(r.resolved).toBe(1)
    expect(await denialOf(pcn)).toMatchObject([{ status: 'resolved', recovered: 90 }])
  })

  it('does not open a work item for a reversal with negative denial adjustments', async () => {
    const pcn = 'TESTREV1'
    await upload('/api/import/837', claim837('REV1', [{ pcn, ...payer, lines: [{ code: '99214', charge: 200 }] }]))
    const res = await (await upload('/api/import/835', remit835({ ...payer, trace: 'TREV1', claims: [{ pcn, status: '22', charge: -200, paid: -80, cas: ['CO*50*-120'] }] }))).json()
    expect(res.newDenials).toBe(0)
    expect(await denialOf(pcn)).toEqual([])
  })
})

describe('claims already on file', () => {
  const lines = [{ code: '99213', charge: 120 }]
  const A = { payerId: 'AAA01', payerName: 'ALPHA PLAN' }
  const B = { payerId: 'BBB02', payerName: 'BETA PLAN' }

  it('keeps a rebill of the same patient control number to another payer', async () => {
    const pcn = 'TESTREBILL1'
    expect(await (await upload('/api/import/837', claim837('RB1', [{ pcn, ...A, lines }]))).json()).toMatchObject({ claims: 1, duplicates: 0 })
    expect(await (await upload('/api/import/837', claim837('RB1', [{ pcn, ...A, lines }]))).json()).toMatchObject({ claims: 0, duplicates: 1 })
    expect(await (await upload('/api/import/837', claim837('RB2', [{ pcn, ...B, lines }]))).json()).toMatchObject({ claims: 1, duplicates: 0 })
    // a remittance from payer A is matched to the claim billed to payer A
    await upload('/api/import/835', remit835({ ...A, trace: 'TRB1', claims: [{ pcn, status: '4', charge: 120, paid: 0, cas: ['CO*22*120'] }] }))
    const { claims, claimPayments, payers } = schema
    const [m] = await getDb().select({ payer: payers.code }).from(claimPayments).innerJoin(claims, eq(claims.id, claimPayments.claimId)).innerJoin(payers, eq(payers.id, claims.payerId)).where(eq(claimPayments.patientControl, pcn))
    expect(m.payer).toBe('AAA01')
  })

  it('keeps every corrected claim (frequency 7), but not the same one twice', async () => {
    const pcn = 'TESTCORR2'
    await upload('/api/import/837', claim837('CR0', [{ pcn, ...A, lines }]))
    expect(await (await upload('/api/import/837', claim837('CR1', [{ pcn, ...A, freq: '7', lines }]))).json()).toMatchObject({ claims: 1, duplicates: 0 })
    expect(await (await upload('/api/import/837', claim837('CR2', [{ pcn, ...A, freq: '7', lines }]))).json()).toMatchObject({ claims: 1, duplicates: 0 })
    expect(await (await upload('/api/import/837', claim837('CR2', [{ pcn, ...A, freq: '7', lines }]))).json()).toMatchObject({ claims: 0, duplicates: 1 })
    const rows = await getDb().select({ f: schema.claims.frequency }).from(schema.claims).where(eq(schema.claims.patientControl, pcn))
    expect(rows.map((r) => r.f).sort()).toEqual(['1', '7', '7'])
  })
})
