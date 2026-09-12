import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  isSameYear,
  isToday,
  isTomorrow,
  startOfDay,
  startOfWeek,
} from 'date-fns'

export type DueTone = 'past' | 'today' | 'tomorrow' | 'soon' | 'nextWeek' | 'later'

export interface DueLabel {
  /** Full human label, e.g. "Due tomorrow at 5pm". */
  label: string
  /** Same, without the leading verb: "tomorrow at 5pm". */
  short: string
  /** Absolute rendering for tooltips: "Thu, Sep 17 · 5:00 PM". */
  absolute: string
  tone: DueTone
  daysAway: number
}

const HORIZON_DAYS = 14

/** "5pm", "5:30pm", "9am". Compact 12-hour time. */
export function formatCompactTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, '0')}${suffix}`
}

export function formatAbsolute(d: Date, allDay: boolean, now = new Date()): string {
  const datePart = isSameYear(d, now) ? format(d, 'EEE, MMM d') : format(d, 'EEE, MMM d, yyyy')
  return allDay ? datePart : `${datePart} · ${format(d, 'h:mm a')}`
}

/**
 * Smart relative due-date label. Deterministic given `now` so it's testable
 * and can be re-evaluated on a timer to stay fresh.
 *
 * Rules (from the spec):
 *  - past               → plain date ("Sep 10")
 *  - today / tomorrow   → "today at 5pm" / "tomorrow"
 *  - 2–6 days           → "in 3 days"
 *  - 7–13 days          → "next Thursday"
 *  - ≥ 14 days          → plain date
 */
export function relativeDue(date: Date, allDay: boolean, now: Date = new Date(), verb = 'Due'): DueLabel {
  const daysAway = differenceInCalendarDays(startOfDay(date), startOfDay(now))
  const time = allDay ? '' : ` at ${formatCompactTime(date)}`
  const absolute = formatAbsolute(date, allDay, now)
  const isPast = allDay ? daysAway < 0 : date.getTime() < now.getTime()

  const make = (short: string, tone: DueTone): DueLabel => ({
    label: verb ? `${verb} ${short}` : short,
    short,
    absolute,
    tone,
    daysAway,
  })

  if (isPast) {
    const datePart = isSameYear(date, now) ? format(date, 'MMM d') : format(date, 'MMM d, yyyy')
    return make(allDay ? datePart : `${datePart} at ${formatCompactTime(date)}`, 'past')
  }
  if (isToday(date) || daysAway === 0) return make(`today${time}`, 'today')
  if (isTomorrow(date) || daysAway === 1) return make(`tomorrow${time}`, 'tomorrow')
  if (daysAway < 7) return make(`in ${daysAway} days${time}`, 'soon')
  if (daysAway < HORIZON_DAYS) return make(`next ${format(date, 'EEEE')}${time}`, 'nextWeek')
  const datePart = isSameYear(date, now) ? format(date, 'MMM d') : format(date, 'MMM d, yyyy')
  return make(`${datePart}${time}`, 'later')
}

/** "Sep 12" / "Sep 12, 2027" */
export function formatShortDate(d: Date, now = new Date()): string {
  return isSameYear(d, now) ? format(d, 'MMM d') : format(d, 'MMM d, yyyy')
}

/** Range label for a time slot: "9:00 – 10:15 AM". */
export function formatTimeRange(start: Date, end: Date): string {
  const sameMeridiem = format(start, 'a') === format(end, 'a')
  const s = sameMeridiem ? format(start, 'h:mm') : format(start, 'h:mm a')
  return `${s} – ${format(end, 'h:mm a')}`
}

/** Title for the calendar header: "September 2026" or "Sep 7 – 13, 2026". */
export function formatRangeTitle(start: Date, end: Date): string {
  if (isSameDay(start, end)) return format(start, 'EEEE, MMMM d, yyyy')
  if (start.getMonth() === end.getMonth()) return `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`
  if (start.getFullYear() === end.getFullYear()) return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
  return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`
}

export function weekRange(anchor: Date, weekStartsOn: 0 | 1): { start: Date; end: Date; days: Date[] } {
  const start = startOfWeek(anchor, { weekStartsOn })
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return { start, end: addDays(start, 6), days }
}

/** Local-time ISO without milliseconds, e.g. 2026-09-12T17:00:00-07:00 */
export function toISO(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm:ssXXX")
}

/** yyyy-MM-dd key for a local calendar day. */
export function dayKey(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

export function setTime(day: Date, hours: number, minutes: number): Date {
  const d = new Date(day)
  d.setHours(hours, minutes, 0, 0)
  return d
}

/** Round a Date to the nearest N minutes. */
export function roundToMinutes(d: Date, step: number): Date {
  const out = new Date(d)
  const mins = Math.round(out.getMinutes() / step) * step
  out.setMinutes(mins, 0, 0)
  return out
}
