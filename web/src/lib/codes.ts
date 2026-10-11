import { useEffect, useState } from 'react'

export type Carc = {
  code: string
  title: string
  plain: string
  category: string
  groups: string[]
  causes: string[]
  fix: string[]
  owner: string
  appeal: string
  kind: string
  start?: string
  stop?: string | null
}
export type Rarc = { code: string; title: string; plain: string; category: string; action: string; alert?: boolean; start?: string; stop?: string | null }
export type Codes = { carc: Map<string, Carc>; rarc: Map<string, Rarc> }

let cached: Promise<Codes> | null = null
export function loadCodes(): Promise<Codes> {
  cached ??= Promise.all(
    ['carc', 'rarc'].map((k) =>
      fetch(`${import.meta.env.BASE_URL}data/${k}.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ),
  ).then(([c, r]) => ({
    carc: new Map((c as Carc[]).map((x) => [x.code, x])),
    rarc: new Map((r as Rarc[]).map((x) => [x.code, x])),
  }))
  return cached
}

export function useCodes() {
  const [codes, set] = useState<Codes | null>(null)
  useEffect(() => {
    loadCodes().then(set)
  }, [])
  return codes
}

export const CATEGORY_LABEL: Record<string, string> = {
  'patient-responsibility': 'Patient responsibility',
  contractual: 'Contractual',
  'missing-info': 'Missing / invalid info',
  coding: 'Coding',
  eligibility: 'Eligibility',
  authorization: 'Authorization',
  coverage: 'Coverage',
  'medical-necessity': 'Medical necessity',
  'timely-filing': 'Timely filing',
  duplicate: 'Duplicate',
  'coordination-of-benefits': 'Coordination of benefits',
  bundling: 'Bundling',
  pricing: 'Pricing',
  provider: 'Provider',
  regulatory: 'Regulatory',
  other: 'Other',
}
