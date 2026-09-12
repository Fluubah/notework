import { addMilliseconds, differenceInCalendarDays, parseISO } from 'date-fns'
import { toast } from '../../components/toastStore'
import { useStore } from '../../data/store'
import { toISO } from '../../lib/dates'
import type { CalendarEvent, Occurrence, Weekday } from '../../types/models'

export type SeriesScope = 'occurrence' | 'series'

/** Shift the whole series by a time delta, keeping weekday rules aligned. */
export function shiftSeries(event: CalendarEvent, deltaMs: number): Partial<CalendarEvent> {
  const start = parseISO(event.start)
  const end = parseISO(event.end)
  const newStart = addMilliseconds(start, deltaMs)
  const newEnd = addMilliseconds(end, deltaMs)
  const patch: Partial<CalendarEvent> = { start: toISO(newStart), end: toISO(newEnd) }
  if (event.recurrence?.byWeekday?.length) {
    const dayDelta = differenceInCalendarDays(newStart, start)
    if (dayDelta !== 0) {
      patch.recurrence = {
        ...event.recurrence,
        byWeekday: event.recurrence.byWeekday.map((d) => (((d + dayDelta) % 7) + 7) % 7 as Weekday),
      }
    }
  }
  return patch
}

/** Move/resize an occurrence to a new [start, end]. Applies to one occurrence or the whole series. */
export function applyTimeChange(occ: Occurrence, newStart: Date, newEnd: Date, scope: SeriesScope) {
  const store = useStore.getState()
  if (!occ.isRecurring) {
    store.updateEvent(occ.eventId, { start: toISO(newStart), end: toISO(newEnd) })
    return
  }
  if (scope === 'occurrence') {
    store.updateOccurrence(occ.eventId, occ.originalStart, { start: toISO(newStart), end: toISO(newEnd) })
    return
  }
  // Whole series: shift by the delta between this occurrence's current start and the new one,
  // and apply the new duration.
  const deltaMs = newStart.getTime() - occ.start.getTime()
  const patch = shiftSeries(occ.event, deltaMs)
  const seriesStart = parseISO(patch.start!)
  patch.end = toISO(new Date(seriesStart.getTime() + (newEnd.getTime() - newStart.getTime())))
  store.updateSeries(occ.eventId, patch)
}

export function deleteOccurrenceOrSeries(occ: Occurrence, scope: SeriesScope) {
  const store = useStore.getState()
  const before = store.events.find((e) => e.id === occ.eventId)
  if (!before) return
  const wholeSeries = !occ.isRecurring || scope === 'series'
  if (wholeSeries) store.deleteEvent(occ.eventId)
  else store.deleteOccurrence(occ.eventId, occ.originalStart)
  toast(wholeSeries ? `Deleted “${occ.title}”` : `Removed this “${occ.title}”`, {
    actionLabel: 'Undo',
    onAction: () => useStore.getState().restoreEvent(before),
  })
}

/** Verb used in relative labels for a given kind. */
export function kindVerb(kind: CalendarEvent['kind']): string {
  switch (kind) {
    case 'assignment':
      return 'Due'
    case 'exam':
      return 'Exam'
    case 'class':
      return 'Class'
    default:
      return ''
  }
}

export const KIND_LABEL: Record<CalendarEvent['kind'], string> = {
  class: 'Class',
  assignment: 'Assignment',
  exam: 'Exam',
  event: 'Event',
}
