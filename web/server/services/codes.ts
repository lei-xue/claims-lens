import carcList from '../../public/data/carc.json'

type Carc = { code: string; title: string; plain: string; category: string; owner: string; fix: string[]; kind: string }
export const CARC = new Map((carcList as Carc[]).map((c) => [c.code, c]))

/**
 * Which adjustments are denials a biller has to work, as opposed to routine
 * contractual write-offs (CO-45 and similar pricing), patient cost-sharing (PR)
 * or prior-payer impact (OA-23).
 */
const ROUTINE = new Set(['CO-45', 'CO-253', 'OA-23', 'CO-59', 'PI-45', 'CO-94', 'CO-131'])
export function isDenial(group: string, reason: string) {
  if (group === 'PR') return false
  return !ROUTINE.has(`${group}-${reason}`)
}

export function categoryOf(reason: string) {
  return CARC.get(reason)?.category ?? 'other'
}

/** Days a practice typically has to appeal, by payer type (defaults; real contracts vary). */
export function appealWindowDays(payerName: string) {
  if (/MEDICARE/i.test(payerName)) return 120
  if (/MEDICAID/i.test(payerName)) return 90
  return 180
}
