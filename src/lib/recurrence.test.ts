import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../types/models'
import { toISO } from './dates'
import { expandEvent, expandEvents, withOccurrenceDeleted, withOccurrenceOverride, withSeriesUpdated } from './recurrence'

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min)

function event(patch: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'e1',
    title: 'Physics',
    kind: 'class',
    categoryId: null,
    start: toISO(d(2026, 9, 7, 9)), // Mon Sep 7 2026, 9:00
    end: toISO(d(2026, 9, 7, 10, 15)),
    allDay: false,
    linkedNoteIds: [],
    linkedPdfIds: [],
    createdAt: '',
    updatedAt: '',
    ...patch,
  }
}

describe('expandEvent', () => {
  it('returns a single occurrence for non-recurring events in range', () => {
    const occ = expandEvent(event({}), d(2026, 9, 6), d(2026, 9, 13))
    expect(occ).toHaveLength(1)
    expect(occ[0].id).toBe('e1')
    expect(occ[0].start).toEqual(d(2026, 9, 7, 9))
  })
  it('excludes non-recurring events outside the range', () => {
    expect(expandEvent(event({}), d(2026, 9, 14), d(2026, 9, 21))).toHaveLength(0)
  })
  it('expands weekly on multiple weekdays', () => {
    const e = event({ recurrence: { freq: 'weekly', byWeekday: [1, 3, 5] } })
    const occ = expandEvent(e, d(2026, 9, 7), d(2026, 9, 20, 23, 59))
    expect(occ.map((o) => o.start.getDate())).toEqual([7, 9, 11, 14, 16, 18])
    expect(occ[0].id).toBe(`e1@${toISO(d(2026, 9, 7, 9))}`)
    expect(occ[0].end).toEqual(d(2026, 9, 7, 10, 15))
  })
  it('respects until', () => {
    const e = event({ recurrence: { freq: 'weekly', byWeekday: [1], until: toISO(d(2026, 9, 21)) } })
    const occ = expandEvent(e, d(2026, 9, 1), d(2026, 12, 1))
    expect(occ.map((o) => o.start.getDate())).toEqual([7, 14, 21])
  })
  it('respects count', () => {
    const e = event({ recurrence: { freq: 'daily', count: 3 } })
    const occ = expandEvent(e, d(2026, 9, 1), d(2026, 12, 1))
    expect(occ).toHaveLength(3)
  })
  it('respects interval (every 2 weeks)', () => {
    const e = event({ recurrence: { freq: 'weekly', interval: 2, byWeekday: [1] } })
    const occ = expandEvent(e, d(2026, 9, 1), d(2026, 10, 10))
    expect(occ.map((o) => o.start.getDate())).toEqual([7, 21, 5])
  })
  it('does not produce occurrences before the series start', () => {
    const e = event({ recurrence: { freq: 'weekly', byWeekday: [1, 3] }, start: toISO(d(2026, 9, 9, 9)), end: toISO(d(2026, 9, 9, 10)) })
    const occ = expandEvent(e, d(2026, 9, 1), d(2026, 9, 13))
    expect(occ.map((o) => o.start.getDate())).toEqual([9])
  })
  it('skips deleted occurrences', () => {
    const e = withOccurrenceDeleted(event({ recurrence: { freq: 'weekly', byWeekday: [1] } }), toISO(d(2026, 9, 14, 9)))
    const occ = expandEvent(e, d(2026, 9, 1), d(2026, 9, 30))
    expect(occ.map((o) => o.start.getDate())).toEqual([7, 21, 28])
  })
  it('applies overrides, including moving an occurrence', () => {
    const e = withOccurrenceOverride(event({ recurrence: { freq: 'weekly', byWeekday: [1] } }), toISO(d(2026, 9, 14, 9)), {
      title: 'Physics (moved)',
      start: toISO(d(2026, 9, 15, 13)),
    })
    const occ = expandEvent(e, d(2026, 9, 13), d(2026, 9, 19))
    expect(occ).toHaveLength(1)
    expect(occ[0].title).toBe('Physics (moved)')
    expect(occ[0].start).toEqual(d(2026, 9, 15, 13))
    expect(occ[0].end).toEqual(d(2026, 9, 15, 14, 15)) // duration preserved
    expect(occ[0].isOverridden).toBe(true)
    expect(occ[0].originalStart).toBe(toISO(d(2026, 9, 14, 9)))
    // Untouched occurrences keep the base title
    const others = expandEvent(e, d(2026, 9, 20), d(2026, 9, 26))
    expect(others[0].title).toBe('Physics')
  })
  it('includes an occurrence moved into the range from outside it', () => {
    const e = withOccurrenceOverride(event({ recurrence: { freq: 'weekly', byWeekday: [1] } }), toISO(d(2026, 10, 5, 9)), {
      start: toISO(d(2026, 9, 16, 9)),
    })
    const occ = expandEvent(e, d(2026, 9, 13), d(2026, 9, 19))
    expect(occ.map((o) => o.start.getDate())).toEqual([14, 16])
  })
  it('handles all-day multi-day ranges intersecting the window', () => {
    const e = event({ allDay: true, start: toISO(d(2026, 9, 5)), end: toISO(d(2026, 9, 9)) })
    expect(expandEvent(e, d(2026, 9, 7), d(2026, 9, 13))).toHaveLength(1)
    expect(expandEvent(e, d(2026, 9, 9), d(2026, 9, 13))).toHaveLength(0) // end is exclusive
  })
})

describe('series helpers', () => {
  it('withSeriesUpdated drops stale exceptions when schedule changes', () => {
    const e = withOccurrenceDeleted(event({ recurrence: { freq: 'weekly', byWeekday: [1] } }), toISO(d(2026, 9, 14, 9)))
    const renamed = withSeriesUpdated(e, { title: 'Chem' })
    expect(renamed.exdates).toHaveLength(1)
    const moved = withSeriesUpdated(e, { start: toISO(d(2026, 9, 7, 10)) })
    expect(moved.exdates).toHaveLength(0)
  })
  it('expandEvents sorts by start', () => {
    const a = event({ id: 'a', start: toISO(d(2026, 9, 8, 9)), end: toISO(d(2026, 9, 8, 10)) })
    const b = event({ id: 'b', start: toISO(d(2026, 9, 7, 9)), end: toISO(d(2026, 9, 7, 10)) })
    expect(expandEvents([a, b], d(2026, 9, 1), d(2026, 9, 30)).map((o) => o.id)).toEqual(['b', 'a'])
  })
})
