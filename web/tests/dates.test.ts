import { describe, expect, it } from 'vitest'
import { daysUntil } from '../src/lib/api'

describe('daysUntil (appeal deadline badge)', () => {
  it('counts calendar days, whatever the time of day', () => {
    const morning = new Date(2026, 10, 2, 9, 0)
    expect(daysUntil('2026-11-03', morning)).toBe(1) // was "Due in 2d"
    expect(daysUntil('2026-11-02', morning)).toBe(0)
    expect(Object.is(daysUntil('2026-11-01', morning), -1)).toBe(true) // was -0, "Due today"
    const evening = new Date(2026, 10, 2, 23, 30)
    expect(daysUntil('2026-11-03', evening)).toBe(1)
    expect(daysUntil('2026-11-01', evening)).toBe(-1)
    expect(daysUntil('2026-11-16', evening)).toBe(14)
  })
  it('is not thrown off by a daylight-saving change', () => {
    expect(daysUntil('2026-03-09', new Date(2026, 2, 7, 12))).toBe(2)
    expect(daysUntil('2026-11-02', new Date(2026, 9, 31, 12))).toBe(2)
  })
})
