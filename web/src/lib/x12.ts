// Minimal X12 5010 tokenizer. Delimiters are read from the fixed-width ISA segment,
// so any valid interchange parses regardless of which separators the sender chose.

export type Delims = { element: string; component: string; repetition: string; segment: string }
export type Segment = { id: string; elements: string[]; index: number; raw: string }

export class X12Error extends Error {}

export function detectDelims(text: string): Delims {
  const start = text.indexOf('ISA')
  if (start < 0) throw new X12Error('No ISA segment found — this does not look like an X12 file.')
  const isa = text.slice(start)
  if (isa.length < 106) throw new X12Error('The ISA segment is truncated (it must be 106 characters).')
  const element = isa[3]
  // ISA has 16 elements; the component separator is ISA16 and the segment terminator follows it.
  let pos = 0
  for (let n = 0; n < 16; n++) {
    pos = isa.indexOf(element, pos + 1)
    if (pos < 0) throw new X12Error('Could not read the ISA segment delimiters.')
  }
  const component = isa[pos + 1]
  const segment = isa[pos + 2]
  const fields = isa.slice(0, pos + 2).split(element)
  const repetition = fields[11]?.length === 1 && !/[A-Za-z0-9]/.test(fields[11]) ? fields[11] : '^'
  return { element, component, repetition, segment }
}

export function parse(text: string): { delims: Delims; segments: Segment[] } {
  const trimmed = text.replace(/^﻿/, '').trim()
  const delims = detectDelims(trimmed)
  const segments: Segment[] = []
  for (const chunk of trimmed.slice(trimmed.indexOf('ISA')).split(delims.segment)) {
    const raw = chunk.replace(/^[\r\n]+|[\r\n]+$/g, '')
    if (!raw.trim()) continue
    const parts = raw.split(delims.element)
    segments.push({ id: parts[0].trim(), elements: parts.slice(1), index: segments.length, raw })
  }
  return { delims, segments }
}

/** Element by 1-based position (X12 numbering: CLM01 is el(seg, 1)). */
export const el = (s: Segment | undefined, n: number) => s?.elements[n - 1] ?? ''
export const comp = (value: string, d: Delims, n: number) => value.split(d.component)[n - 1] ?? ''

export function money(v: string | number) {
  const n = typeof v === 'number' ? v : Number(v || 0)
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** CCYYMMDD → readable date */
export function date(v: string) {
  if (!/^\d{8}$/.test(v)) return v
  const d = new Date(Number(v.slice(0, 4)), Number(v.slice(4, 6)) - 1, Number(v.slice(6, 8)))
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** NPI check digit (Luhn over "80840" + first 9 digits). */
export function validNpi(npi: string) {
  if (!/^\d{10}$/.test(npi)) return false
  const digits = ('80840' + npi.slice(0, 9)).split('').map(Number)
  let sum = 0
  for (let i = digits.length - 1, dbl = true; i >= 0; i--, dbl = !dbl) {
    let d = digits[i]
    if (dbl) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return (10 - (sum % 10)) % 10 === Number(npi[9])
}

export const cents = (n: number) => Math.round(n * 100)
