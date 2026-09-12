import { beforeEach, describe, expect, it } from 'vitest'
import { toISO } from '../lib/dates'
import { emptyAppData } from '../types/models'
import { useStore } from './store'

const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h)

describe('store', () => {
  beforeEach(() => {
    useStore.setState({ ...emptyAppData(), hydrated: true })
  })

  it('adds and deletes categories, unlinking events', () => {
    const cat = useStore.getState().addCategory({ name: 'Physics', color: '#ff0000' })
    const ev = useStore.getState().addEvent({
      title: 'HW',
      kind: 'assignment',
      categoryId: cat.id,
      start: toISO(d(2026, 9, 12)),
      end: toISO(d(2026, 9, 13)),
      allDay: true,
    })
    expect(useStore.getState().events[0].categoryId).toBe(cat.id)
    useStore.getState().deleteCategory(cat.id)
    expect(useStore.getState().categories).toHaveLength(0)
    expect(useStore.getState().events.find((e) => e.id === ev.id)?.categoryId).toBeNull()
  })

  it('toggles completion per-occurrence for recurring events', () => {
    const ev = useStore.getState().addEvent({
      title: 'Quiz',
      kind: 'assignment',
      categoryId: null,
      start: toISO(d(2026, 9, 7, 9)),
      end: toISO(d(2026, 9, 7, 10)),
      allDay: false,
      recurrence: { freq: 'weekly', byWeekday: [1] },
    })
    const key = toISO(d(2026, 9, 14, 9))
    useStore.getState().toggleCompleted(ev.id, key)
    const stored = useStore.getState().events[0]
    expect(stored.overrides?.[key]?.completed).toBe(true)
    expect(stored.completed).toBeUndefined()
    useStore.getState().toggleCompleted(ev.id, key)
    expect(useStore.getState().events[0].overrides?.[key]?.completed).toBe(false)
  })

  it('deleting a note removes links from events', () => {
    const note = useStore.getState().addNote({ categoryId: null, folderId: null })
    const ev = useStore.getState().addEvent({
      title: 'Essay',
      kind: 'assignment',
      categoryId: null,
      start: toISO(d(2026, 9, 12)),
      end: toISO(d(2026, 9, 13)),
      allDay: true,
      linkedNoteIds: [note.id],
    })
    useStore.getState().deleteNote(note.id)
    expect(useStore.getState().events.find((e) => e.id === ev.id)?.linkedNoteIds).toEqual([])
  })
})
