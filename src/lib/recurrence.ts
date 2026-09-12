import { addDays, addWeeks, differenceInMilliseconds, endOfDay, isAfter, isBefore, parseISO, startOfDay } from 'date-fns'
import type { CalendarEvent, Occurrence, OccurrenceOverride, Weekday } from '../types/models'
import { toISO } from './dates'

const MAX_OCCURRENCES = 2000

/** Build the stable occurrence id. */
export function occurrenceId(eventId: string, originalStart: string, recurring: boolean): string {
  return recurring ? `${eventId}@${originalStart}` : eventId
}

/** Parse an occurrence id back into its parts. */
export function parseOccurrenceId(id: string): { eventId: string; originalStart: string | null } {
  const at = id.indexOf('@')
  if (at === -1) return { eventId: id, originalStart: null }
  return { eventId: id.slice(0, at), originalStart: id.slice(at + 1) }
}

function applyOverride(base: Occurrence, ov: OccurrenceOverride | undefined): Occurrence {
  if (!ov) return base
  const start = ov.start ? parseISO(ov.start) : base.start
  const end = ov.end ? parseISO(ov.end) : ov.start ? new Date(start.getTime() + (base.end.getTime() - base.start.getTime())) : base.end
  return {
    ...base,
    title: ov.title ?? base.title,
    start,
    end,
    location: ov.location ?? base.location,
    description: ov.description ?? base.description,
    categoryId: ov.categoryId === undefined ? base.categoryId : ov.categoryId,
    completed: ov.completed ?? base.completed,
    isOverridden: true,
  }
}

function makeOccurrence(event: CalendarEvent, start: Date, end: Date, originalStart: string, recurring: boolean): Occurrence {
  return {
    id: occurrenceId(event.id, originalStart, recurring),
    eventId: event.id,
    event,
    originalStart,
    start,
    end,
    title: event.title,
    allDay: event.allDay,
    categoryId: event.categoryId,
    kind: event.kind,
    location: event.location,
    description: event.description,
    completed: event.completed ?? false,
    isRecurring: recurring,
    isOverridden: false,
  }
}

/**
 * Expand a single event into the occurrences that intersect [rangeStart, rangeEnd].
 * Handles exdates and per-occurrence overrides. Overridden occurrences that were
 * moved *into* the range are included; ones moved out are excluded.
 */
export function expandEvent(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): Occurrence[] {
  const start = parseISO(event.start)
  const end = parseISO(event.end)
  const duration = Math.max(0, differenceInMilliseconds(end, start))
  const intersects = (s: Date, e: Date) => s.getTime() <= rangeEnd.getTime() && e.getTime() > rangeStart.getTime()

  if (!event.recurrence) {
    const occ = makeOccurrence(event, start, end, event.start, false)
    return intersects(occ.start, occ.end) ? [occ] : []
  }

  const rule = event.recurrence
  const interval = Math.max(1, rule.interval ?? 1)
  const until = rule.until ? endOfDay(parseISO(rule.until)) : null
  const exdates = new Set(event.exdates ?? [])
  const overrides = event.overrides ?? {}
  const out: Occurrence[] = []
  let produced = 0

  const emit = (occStart: Date) => {
    const originalStart = toISO(occStart)
    const occEnd = new Date(occStart.getTime() + duration)
    if (exdates.has(originalStart)) return
    const occ = applyOverride(makeOccurrence(event, occStart, occEnd, originalStart, true), overrides[originalStart])
    if (intersects(occ.start, occ.end)) out.push(occ)
  }

  // Overrides can move an occurrence anywhere, including outside the natural
  // iteration window. We iterate the natural series but stop generating once
  // we're past the range *and* past any override that could still land inside it.
  // The override keys are the *original* starts, so we must iterate at least
  // that far to reach an occurrence that was moved back into the range.
  const overrideKeys = Object.keys(overrides).map((k) => parseISO(k))
  const latestRelevant = overrideKeys.reduce((max, d) => (isAfter(d, max) ? d : max), rangeEnd)

  if (rule.freq === 'daily') {
    let cursor = start
    while (produced < MAX_OCCURRENCES) {
      if (until && isAfter(cursor, until)) break
      if (rule.count && produced >= rule.count) break
      produced++
      emit(cursor)
      cursor = addDays(cursor, interval)
      if (isAfter(startOfDay(cursor), latestRelevant) && isAfter(cursor, rangeEnd)) break
    }
    return out
  }

  // weekly
  const weekdays: Weekday[] = (rule.byWeekday && rule.byWeekday.length > 0 ? rule.byWeekday : [start.getDay() as Weekday]).slice().sort()
  // Anchor at the start of the week (Sunday) that contains `start`.
  const weekAnchor = addDays(startOfDay(start), -start.getDay())
  let week = 0
  while (produced < MAX_OCCURRENCES) {
    const weekStart = addWeeks(weekAnchor, week * interval)
    if (isAfter(weekStart, latestRelevant) && isAfter(weekStart, rangeEnd)) break
    let done = false
    for (const wd of weekdays) {
      const occStart = new Date(weekStart)
      occStart.setDate(weekStart.getDate() + wd)
      occStart.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0)
      if (isBefore(occStart, start)) continue
      if (until && isAfter(occStart, until)) {
        done = true
        break
      }
      if (rule.count && produced >= rule.count) {
        done = true
        break
      }
      produced++
      emit(occStart)
    }
    if (done) break
    week++
  }
  return out
}

/** Expand every event in a list and return occurrences sorted by start. */
export function expandEvents(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date): Occurrence[] {
  const out: Occurrence[] = []
  for (const e of events) out.push(...expandEvent(e, rangeStart, rangeEnd))
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title))
}

/** Returns a copy of the event with the given occurrence removed from the series. */
export function withOccurrenceDeleted(event: CalendarEvent, originalStart: string): CalendarEvent {
  const exdates = new Set(event.exdates ?? [])
  exdates.add(originalStart)
  const overrides = { ...(event.overrides ?? {}) }
  delete overrides[originalStart]
  return { ...event, exdates: [...exdates], overrides }
}

/** Returns a copy of the event with an occurrence-specific override applied. */
export function withOccurrenceOverride(event: CalendarEvent, originalStart: string, patch: OccurrenceOverride): CalendarEvent {
  const overrides = { ...(event.overrides ?? {}) }
  overrides[originalStart] = { ...(overrides[originalStart] ?? {}), ...patch }
  return { ...event, overrides }
}

/**
 * Applies a series-level edit while keeping the time-of-day for existing
 * overrides meaningful. If the series start moves, override keys stay keyed
 * to the *original* schedule so we recompute them relative to the new start.
 */
export function withSeriesUpdated(event: CalendarEvent, patch: Partial<CalendarEvent>): CalendarEvent {
  const next = { ...event, ...patch }
  // If the schedule shape changed (start time or rule), old exdates/overrides
  // no longer line up with generated originalStart keys, so drop them.
  const scheduleChanged =
    (patch.start !== undefined && patch.start !== event.start) ||
    (patch.recurrence !== undefined && JSON.stringify(patch.recurrence) !== JSON.stringify(event.recurrence))
  if (scheduleChanged) {
    next.exdates = []
    next.overrides = {}
  }
  return next
}

/** Human summary of a rule: "Weekly on Mon, Wed, Fri until Dec 12". */
export function describeRecurrence(rule: CalendarEvent['recurrence']): string {
  if (!rule) return 'Does not repeat'
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const interval = rule.interval ?? 1
  let base: string
  if (rule.freq === 'daily') base = interval === 1 ? 'Daily' : `Every ${interval} days`
  else {
    const days = (rule.byWeekday ?? []).slice().sort().map((d) => names[d]).join(', ')
    base = interval === 1 ? `Weekly${days ? ` on ${days}` : ''}` : `Every ${interval} weeks${days ? ` on ${days}` : ''}`
  }
  if (rule.until) base += ` until ${parseISO(rule.until).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  else if (rule.count) base += `, ${rule.count} times`
  return base
}

/**
 * Resolve a specific occurrence by its original start, applying any override.
 * Returns null if the occurrence was deleted or is not part of the series.
 */
export function occurrenceAt(event: CalendarEvent, originalStart: string | null): Occurrence | null {
  if (!event.recurrence || !originalStart) {
    const s = parseISO(event.start)
    const e = parseISO(event.end)
    return makeOccurrence(event, s, e, event.start, false)
  }
  if (event.exdates?.includes(originalStart)) return null
  const s = parseISO(originalStart)
  const e = new Date(s.getTime() + (parseISO(event.end).getTime() - parseISO(event.start).getTime()))
  return applyOverride(makeOccurrence(event, s, e, originalStart, true), event.overrides?.[originalStart])
}

/** Find an occurrence from its id across all events. */
export function findOccurrence(events: CalendarEvent[], id: string): Occurrence | null {
  const { eventId, originalStart } = parseOccurrenceId(id)
  const event = events.find((e) => e.id === eventId)
  if (!event) return null
  return occurrenceAt(event, originalStart)
}
