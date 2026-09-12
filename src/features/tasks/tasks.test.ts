import { describe, expect, it } from 'vitest'
import { toISO } from '../../lib/dates'
import type { CalendarEvent } from '../../types/models'
import { deriveTasks, groupTasks } from './tasks'

const now = new Date(2026, 8, 12, 10) // Sat Sep 12 2026 (week starts Monday → week ends Sun 13)
const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h)
let seq = 0
function ev(patch: Partial<CalendarEvent>): CalendarEvent {
  return { id: `e${++seq}`, title: 't', kind: 'assignment', categoryId: null, start: '', end: '', allDay: false, linkedNoteIds: [], linkedPdfIds: [], createdAt: '', updatedAt: '', ...patch }
}
const at = (date: Date, patch: Partial<CalendarEvent> = {}) => ev({ start: toISO(date), end: toISO(date), ...patch })

describe('deriveTasks', () => {
  it('only includes assignments and exams, sorted by due', () => {
    const events = [at(d(2026, 9, 20), { title: 'later' }), at(d(2026, 9, 13), { title: 'sooner' }), ev({ kind: 'class', title: 'lecture', start: toISO(d(2026, 9, 14, 9)), end: toISO(d(2026, 9, 14, 10)) })]
    expect(deriveTasks(events, now).map((t) => t.title)).toEqual(['sooner', 'later'])
  })
  it('expands recurring quizzes into one task per occurrence', () => {
    const weekly = ev({ title: 'quiz', start: toISO(d(2026, 9, 14, 9)), end: toISO(d(2026, 9, 14, 9)), recurrence: { freq: 'weekly', byWeekday: [1], count: 3 } })
    expect(deriveTasks([weekly], now)).toHaveLength(3)
  })
})

describe('groupTasks', () => {
  it('buckets by due date relative to now', () => {
    const tasks = deriveTasks(
      [
        at(d(2026, 9, 10, 17), { title: 'overdue' }),
        at(d(2026, 9, 12, 8), { title: 'earlier today' }),
        at(d(2026, 9, 12, 23), { title: 'today' }),
        at(d(2026, 9, 13, 9), { title: 'tomorrow' }),
        at(d(2026, 9, 15), { title: 'next week (tue)' }),
        at(d(2026, 9, 30), { title: 'later' }),
        at(d(2026, 9, 11), { title: 'done', completed: true }),
      ],
      now,
    )
    const g = groupTasks(tasks, now, 1)
    const byKey = Object.fromEntries(g.map((x) => [x.key, x.tasks.map((t) => t.title)]))
    expect(byKey.overdue).toEqual(['overdue', 'earlier today'])
    expect(byKey.today).toEqual(['today'])
    expect(byKey.tomorrow).toEqual(['tomorrow'])
    expect(byKey.week).toBeUndefined() // Sat → week ends Sunday (tomorrow), nothing else falls in
    expect(byKey.nextWeek).toEqual(['next week (tue)'])
    expect(byKey.later).toEqual(['later'])
    expect(byKey.done).toEqual(['done'])
  })
  it('sorts by priority within a group', () => {
    const tasks = deriveTasks([at(d(2026, 9, 30), { title: 'low', priority: 'low' }), at(d(2026, 9, 29), { title: 'none' }), at(d(2026, 9, 30, 12), { title: 'high', priority: 'high' })], now)
    const g = groupTasks(tasks, now, 1).find((x) => x.key === 'later')!
    expect(g.tasks.map((t) => t.title)).toEqual(['high', 'low', 'none'])
  })
  it('all-day tasks due today are not overdue', () => {
    const tasks = deriveTasks([ev({ title: 'read', allDay: true, start: toISO(d(2026, 9, 12)), end: toISO(d(2026, 9, 13)) })], now)
    expect(groupTasks(tasks, now, 1)[0].key).toBe('today')
  })
})
