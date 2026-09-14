import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatCompactTime, formatRangeTitle, relativeDue, toISO } from './dates'

const now = new Date(2026, 8, 12, 10, 0) // Sat Sep 12 2026 10:00

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min)

describe('relativeDue', () => {
  it('handles today', () => {
    expect(relativeDue(at(2026, 9, 12, 17), false, now).label).toBe('Due today at 5pm')
    expect(relativeDue(at(2026, 9, 12), true, now).label).toBe('Due today')
    expect(relativeDue(at(2026, 9, 12, 17), false, now).tone).toBe('today')
  })
  it('handles tomorrow', () => {
    expect(relativeDue(at(2026, 9, 13, 17, 30), false, now).label).toBe('Due tomorrow at 5:30pm')
    expect(relativeDue(at(2026, 9, 13), true, now).tone).toBe('tomorrow')
  })
  it('uses "in N days" inside a week', () => {
    expect(relativeDue(at(2026, 9, 15, 23), false, now).label).toBe('Due in 3 days at 11pm')
    expect(relativeDue(at(2026, 9, 18), true, now).label).toBe('Due in 6 days')
  })
  it('uses "next Weekday" for 7–13 days', () => {
    expect(relativeDue(at(2026, 9, 19), true, now).label).toBe('Due next Saturday')
    expect(relativeDue(at(2026, 9, 24, 9), false, now).label).toBe('Due next Thursday at 9am')
    expect(relativeDue(at(2026, 9, 25), true, now).tone).toBe('nextWeek')
  })
  it('falls back to an absolute date at 14+ days', () => {
    expect(relativeDue(at(2026, 9, 26), true, now).label).toBe('Due Sep 26')
    expect(relativeDue(at(2027, 1, 4, 9), false, now).label).toBe('Due Jan 4, 2027 at 9am')
  })
  it('falls back to an absolute date once past', () => {
    expect(relativeDue(at(2026, 9, 10, 17), false, now).label).toBe('Due Sep 10 at 5pm')
    expect(relativeDue(at(2026, 9, 12, 9), false, now).tone).toBe('past') // earlier today
    expect(relativeDue(at(2026, 9, 12), true, now).tone).toBe('today') // all-day today is not past
  })
  it('updates as time passes', () => {
    const due = at(2026, 9, 14, 12)
    expect(relativeDue(due, false, at(2026, 9, 12)).short).toBe('in 2 days at 12pm')
    expect(relativeDue(due, false, at(2026, 9, 13)).short).toBe('tomorrow at 12pm')
    expect(relativeDue(due, false, at(2026, 9, 14, 8)).short).toBe('today at 12pm')
    expect(relativeDue(due, false, at(2026, 9, 14, 13)).tone).toBe('past')
  })
  it('ignores the real clock and uses the `now` it is given', () => {
    // These labels are rendered from a `now` the caller controls, and the
    // suite must not pass or fail depending on the day it is run.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2027, 5, 1, 9, 0)) // nowhere near the fixture
    try {
      expect(relativeDue(at(2026, 9, 12, 17), false, now).label).toBe('Due today at 5pm')
      expect(relativeDue(at(2026, 9, 13, 17), false, now).label).toBe('Due tomorrow at 5pm')
      expect(relativeDue(at(2026, 9, 15, 23), false, now).label).toBe('Due in 3 days at 11pm')
    } finally {
      vi.useRealTimers()
    }
  })
  it('supports a different verb', () => {
    expect(relativeDue(at(2026, 9, 13, 9), false, now, 'Exam').label).toBe('Exam tomorrow at 9am')
    expect(relativeDue(at(2026, 9, 13, 9), false, now, '').label).toBe('tomorrow at 9am')
  })
})

describe('formatCompactTime', () => {
  it('formats', () => {
    expect(formatCompactTime(at(2026, 1, 1, 0, 0))).toBe('12am')
    expect(formatCompactTime(at(2026, 1, 1, 12, 5))).toBe('12:05pm')
    expect(formatCompactTime(at(2026, 1, 1, 23, 59))).toBe('11:59pm')
  })
})

describe('formatRangeTitle', () => {
  it('collapses same month', () => {
    expect(formatRangeTitle(at(2026, 9, 7), at(2026, 9, 13))).toBe('Sep 7 – 13, 2026')
    expect(formatRangeTitle(at(2026, 9, 28), at(2026, 10, 4))).toBe('Sep 28 – Oct 4, 2026')
    expect(formatRangeTitle(at(2026, 12, 28), at(2027, 1, 3))).toBe('Dec 28, 2026 – Jan 3, 2027')
  })
})

describe('toISO', () => {
  it('round-trips local time', () => {
    const d = at(2026, 9, 12, 17, 30)
    expect(new Date(toISO(d)).getTime()).toBe(d.getTime())
  })
})

afterEach(() => {
  vi.useRealTimers()
})
