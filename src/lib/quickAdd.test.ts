import { describe, expect, it } from 'vitest'
import type { Category } from '../types/models'
import { parseQuickAdd } from './quickAdd'

const now = new Date(2026, 8, 12, 10, 0) // Sat Sep 12 2026, 10:00
const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min)
const cats: Category[] = [
  { id: 'phys', name: 'Physics 201', code: 'PHYS 201', color: '#000', createdAt: '', sortOrder: 0 },
  { id: 'chem', name: 'Organic Chemistry', code: 'CHEM 210', color: '#000', createdAt: '', sortOrder: 1 },
  { id: 'hist', name: 'History', color: '#000', createdAt: '', sortOrder: 2 },
]
const p = (s: string) => parseQuickAdd(s, { now, categories: cats })!

describe('parseQuickAdd', () => {
  it('parses "Physics HW due Friday 11pm"', () => {
    const r = p('Physics HW due Friday 11pm')
    expect(r.title).toBe('HW')
    expect(r.kind).toBe('assignment')
    expect(r.categoryId).toBe('phys')
    expect(r.start).toEqual(d(2026, 9, 18, 23, 0))
    expect(r.end).toEqual(d(2026, 9, 18, 23, 0))
    expect(r.allDay).toBe(false)
  })
  it('parses "Essay draft due tomorrow" as all-day assignment', () => {
    const r = p('Essay draft due tomorrow')
    expect(r.title).toBe('Essay draft')
    expect(r.kind).toBe('assignment')
    expect(r.allDay).toBe(true)
    expect(r.start).toEqual(d(2026, 9, 13))
    expect(r.end).toEqual(d(2026, 9, 14))
  })
  it('parses a time range', () => {
    const r = p('Study group tomorrow 3-4:30pm')
    expect(r.kind).toBe('event')
    expect(r.title).toBe('Study group')
    expect(r.start).toEqual(d(2026, 9, 13, 15))
    expect(r.end).toEqual(d(2026, 9, 13, 16, 30))
  })
  it('parses "next tuesday at 9am" with default 1h duration', () => {
    const r = p('Dentist next tuesday at 9am')
    expect(r.start).toEqual(d(2026, 9, 15, 9))
    expect(r.end).toEqual(d(2026, 9, 15, 10))
  })
  it('parses duration', () => {
    const r = p('Lab meeting monday 2pm for 90 min')
    expect(r.start).toEqual(d(2026, 9, 14, 14))
    expect(r.end).toEqual(d(2026, 9, 14, 15, 30))
    expect(r.title).toBe('Lab meeting')
  })
  it('parses weekly recurrence with weekdays', () => {
    const r = p('CHEM 210 lecture every mon/wed 10am')
    expect(r.kind).toBe('class')
    expect(r.categoryId).toBe('chem')
    expect(r.recurrence).toEqual({ freq: 'weekly', byWeekday: [1, 3] })
    expect(r.start).toEqual(d(2026, 9, 14, 10)) // next Monday
    expect(r.title).toBe('lecture')
  })
  it('parses "every other week"', () => {
    const r = p('Advising every other week on Thursday 4pm')
    expect(r.recurrence).toEqual({ freq: 'weekly', interval: 2, byWeekday: [4] })
    expect(r.start).toEqual(d(2026, 9, 17, 16))
  })
  it('parses daily', () => {
    const r = p('Meditate every day 7am')
    expect(r.recurrence).toEqual({ freq: 'daily' })
    expect(r.start.getHours()).toBe(7)
  })
  it('parses exams', () => {
    const r = p('History midterm Oct 3 2pm @ Room 101')
    expect(r.kind).toBe('exam')
    expect(r.categoryId).toBe('hist')
    expect(r.start).toEqual(d(2026, 10, 3, 14))
    expect(r.location).toBe('Room 101')
    expect(r.title).toBe('midterm')
  })
  it('parses priority', () => {
    expect(p('Problem set 4 due friday!!').priority).toBe('high')
    expect(p('Problem set 4 due friday!!').title).toBe('Problem set 4')
    expect(p('Read chapter 3 low priority').priority).toBe('low')
    expect(p('Read chapter 3 high priority').priority).toBe('high')
  })
  it('parses "in 3 days" and month-day dates', () => {
    expect(p('Renew library books in 3 days').start).toEqual(d(2026, 9, 15))
    expect(p('Pay rent Oct 1').start).toEqual(d(2026, 10, 1))
    expect(p('Pay rent Oct 1').title).toBe('Pay rent')
  })
  it('parses explicit dates', () => {
    const r = p('Final exam 12/15 at 8:30am')
    expect(r.start).toEqual(d(2026, 12, 15, 8, 30))
    expect(r.kind).toBe('exam')
  })
  it('falls back to today when no date is found', () => {
    const r = p('Buy notebooks')
    expect(r.dateGuessed).toBe(true)
    expect(r.allDay).toBe(true)
    expect(r.start).toEqual(d(2026, 9, 12))
    expect(r.title).toBe('Buy notebooks')
  })
  it('matches category by code and hashtag', () => {
    expect(p('#PHYS 201 quiz friday').categoryId).toBe('phys')
    expect(p('quiz for Organic Chemistry friday').categoryId).toBe('chem')
  })
  it('handles "tonight" and "noon"', () => {
    expect(p('Reading due tonight').start.getHours()).toBeGreaterThanOrEqual(18)
    expect(p('Lunch with Sam wednesday at noon').start).toEqual(d(2026, 9, 16, 12))
  })
  it('handles recurrence until', () => {
    const r = p('Yoga every tuesday 6pm until Dec 1')
    expect(r.recurrence?.freq).toBe('weekly')
    expect(r.recurrence?.until).toBeTruthy()
    expect(new Date(r.recurrence!.until!).getMonth()).toBe(11)
    expect(r.title).toBe('Yoga')
  })
  it('returns null for empty input', () => {
    expect(parseQuickAdd('   ')).toBeNull()
  })
})

describe('category prefix matching', () => {
  it('matches "Chem" to Organic Chemistry / CHEM 210', () => {
    const r = p('Chem lecture every mon/wed 10am')
    expect(r.categoryId).toBe('chem')
    expect(r.title).toBe('lecture')
  })
  it('does not match unrelated words', () => {
    expect(p('Buy groceries tomorrow').categoryId).toBeNull()
  })
})
