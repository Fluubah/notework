import { expandEvents } from './recurrence'
import type { CalendarEvent, Category, Occurrence } from '../types/models'

/**
 * iCalendar (RFC 5545) generation.
 *
 * Recurring events are written out as one VEVENT per occurrence rather than as
 * an RRULE. An RRULE would be smaller, but it would also be a second
 * implementation of the recurrence rules that has to agree with
 * `lib/recurrence.ts` about exdates, per-occurrence overrides and counting —
 * and any disagreement shows up as a wrong date in someone's calendar. The
 * expansion is already correct and tested, so reuse it.
 */

/** Product identifier, per RFC 5545 §3.7.3. */
const PRODID = '-//Notework//Notework Calendar//EN'

/** How far either side of today the feed covers. */
export const FEED_PAST_DAYS = 60
export const FEED_FUTURE_DAYS = 400

export interface IcsOptions {
  /** Calendar name shown by the subscribing client. */
  name?: string
  /** Minutes before the start to fire an alarm. Omit for no alarms. */
  alarmMinutesBefore?: number | null
  /** Categories, so an event can carry its class name. */
  categories?: Category[]
  /** Injectable for tests. */
  now?: Date
}

/**
 * Escape a text value: RFC 5545 §3.3.11 gives backslash, semicolon, comma and
 * newline special meaning inside TEXT.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Fold a content line to 75 octets (RFC 5545 §3.1). The limit counts bytes,
 * not characters, and a multi-byte character must not be split across the
 * fold — an accented class name or an emoji would otherwise arrive corrupted.
 */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line

  const out: string[] = []
  let current = ''
  let currentBytes = 0
  // Continuation lines start with a space, which counts toward their 75.
  let limit = 75

  for (const char of line) {
    const size = new TextEncoder().encode(char).length
    if (currentBytes + size > limit) {
      out.push(current)
      current = ''
      currentBytes = 0
      limit = 74
    }
    current += char
    currentBytes += size
  }
  if (current) out.push(current)
  return out.join('\r\n ')
}

/** "20260912T183000Z" — a UTC timestamp, so no VTIMEZONE block is needed. */
function toUtcBasic(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

/** "20260912" in local time — all-day events are floating dates, not instants. */
function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

/**
 * A stable, unique id for an occurrence. Re-fetching the feed must update the
 * existing entry rather than add a second copy, and that hinges entirely on
 * this value staying the same for the same occurrence.
 */
export function occurrenceUid(occ: Occurrence, domain = 'notework.app'): string {
  const suffix = occ.isRecurring ? `-${occ.originalStart.replace(/[^0-9T]/g, '')}` : ''
  return `${occ.eventId}${suffix}@${domain}`
}

const KIND_PREFIX: Record<string, string> = {
  assignment: 'Due: ',
  exam: 'Exam: ',
}

function describe(occ: Occurrence, categoryName: string | null): string[] {
  const lines: string[] = []
  if (occ.description) lines.push(occ.description)
  if (categoryName) lines.push(`Class: ${categoryName}`)
  if (occ.kind === 'assignment' || occ.kind === 'exam') {
    lines.push(occ.completed ? 'Status: done' : 'Status: not done')
  }
  return lines
}

function vevent(occ: Occurrence, opts: IcsOptions, dtstamp: string, categoryName: string | null): string[] {
  const lines: string[] = ['BEGIN:VEVENT']
  lines.push(`UID:${occurrenceUid(occ)}`)
  lines.push(`DTSTAMP:${dtstamp}`)

  if (occ.allDay) {
    // DTEND is exclusive for DATE values (RFC 5545 §3.6.1), and the app
    // already stores all-day ends exclusively, so this passes straight through.
    lines.push(`DTSTART;VALUE=DATE:${localDate(occ.start)}`)
    lines.push(`DTEND;VALUE=DATE:${localDate(occ.end)}`)
  } else {
    lines.push(`DTSTART:${toUtcBasic(occ.start)}`)
    lines.push(`DTEND:${toUtcBasic(occ.end)}`)
  }

  const prefix = KIND_PREFIX[occ.kind] ?? ''
  lines.push(`SUMMARY:${escapeText(prefix + occ.title)}`)

  const description = describe(occ, categoryName)
  if (description.length) lines.push(`DESCRIPTION:${escapeText(description.join('\n'))}`)
  if (occ.location) lines.push(`LOCATION:${escapeText(occ.location)}`)
  if (categoryName) lines.push(`CATEGORIES:${escapeText(categoryName)}`)
  // A finished assignment stays in the calendar as a record, but greyed out.
  if (occ.completed) lines.push('STATUS:CANCELLED')

  const alarm = opts.alarmMinutesBefore
  if (alarm != null && alarm > 0 && !occ.completed) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(occ.title)}`, `TRIGGER:-PT${Math.round(alarm)}M`, 'END:VALARM')
  }

  lines.push('END:VEVENT')
  return lines
}

/** Build a complete .ics document from already-expanded occurrences. */
export function buildIcs(occurrences: Occurrence[], opts: IcsOptions = {}): string {
  const now = opts.now ?? new Date()
  const dtstamp = toUtcBasic(now)
  const categoryNames = new Map((opts.categories ?? []).map((c) => [c.id, c.name]))

  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  if (opts.name) {
    lines.push(`X-WR-CALNAME:${escapeText(opts.name)}`)
    lines.push(`NAME:${escapeText(opts.name)}`)
  }
  for (const occ of occurrences) {
    lines.push(...vevent(occ, opts, dtstamp, occ.categoryId ? (categoryNames.get(occ.categoryId) ?? null) : null))
  }
  lines.push('END:VCALENDAR')

  // RFC 5545 requires CRLF line endings, and a trailing one.
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/** Expand a window around `now` and render it. The feed's entry point. */
export function buildIcsFeed(events: CalendarEvent[], opts: IcsOptions = {}): string {
  const now = opts.now ?? new Date()
  const day = 86_400_000
  const occurrences = expandEvents(events, new Date(now.getTime() - FEED_PAST_DAYS * day), new Date(now.getTime() + FEED_FUTURE_DAYS * day))
  return buildIcs(occurrences, { ...opts, now })
}
