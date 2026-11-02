// Parser / interpreter checks on small hand-built files (no database needed).
import { describe, expect, it } from 'vitest'
import { interpret, transactionType, type Remit } from '../src/lib/interpret'
import { claim837, interchange, remitBody } from './fixtures'

describe('835 with several ST/SE transactions', () => {
  const text = interchange('835', [
    remitBody({ payerId: 'AAA01', payerName: 'ALPHA PLAN', trace: 'TRA1', claims: [{ pcn: 'P1', status: '1', charge: 100, paid: 70, cas: ['CO*45*30'] }] }),
    remitBody({ payerId: 'BBB02', payerName: 'BETA PLAN', trace: 'TRB2', claims: [{ pcn: 'P2', status: '1', charge: 200, paid: 150, cas: ['CO*45*50'] }] }),
  ])

  it('reads one remittance per transaction, each with its own payment and payer', () => {
    const r = interpret(text)
    expect(r.transactions).toHaveLength(2)
    const [a, b] = r.transactions.map((t) => t.doc as Remit)
    expect(a).toMatchObject({ payer: 'ALPHA PLAN', payerId: 'AAA01', trace: 'TRA1', payment: 70 })
    expect(a.claims.map((c) => c.patientControl)).toEqual(['P1'])
    expect(b).toMatchObject({ payer: 'BETA PLAN', payerId: 'BBB02', trace: 'TRB2', payment: 150 })
    expect(b.claims.map((c) => c.patientControl)).toEqual(['P2'])
    expect(r.doc).toBe(a)
  })

  it('balances and checks the envelope per transaction', () => {
    const r = interpret(text)
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([])
    // a wrong SE01 in the second transaction is reported against that transaction only
    const n = Number(/SE\*(\d+)\*0002/.exec(text)![1])
    const bad = interpret(text.replace(`SE*${n}*0002`, `SE*${n - 1}*0002`))
    expect(bad.transactions[0].issues).toEqual([])
    expect(bad.transactions[1].issues.map((i) => i.message)).toEqual([`SE01 says ${n - 1} segments but the transaction has ${n}.`])
  })
})

describe('transactionType', () => {
  it('reads ST01 whatever element separator the file uses', () => {
    const remit = interchange('835', [remitBody({ payerId: 'AAA01', payerName: 'ALPHA PLAN', trace: 'T1', claims: [{ pcn: 'P1', status: '1', charge: 10, paid: 10 }] })], { element: '|' })
    expect(remit).not.toMatch(/ST\*835/)
    expect(transactionType(remit)).toBe('835')
    expect(transactionType(claim837('R1', [{ pcn: 'P1', payerId: 'A', payerName: 'A', lines: [{ code: '99213', charge: 10 }] }]))).toBe('837')
    expect(transactionType('hello')).toBeNull()
  })
})
