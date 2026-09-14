import { describe, expect, it } from 'vitest'
import { buildIcs, buildIcsFeed, escapeText, foldLine, occurrenceUid } from './ics'
import { expandEvents } from './recurrence'
import type { CalendarEvent, Category, Occurrence } from '../types/models'

const NOW = new Date(2026, 8, 12, 10, 0)

function event(patch: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    title: 'Lecture',
    kind: 'class',
    categoryId: null,
    start: '2026-09-14T09:00:00.000Z',
    end: '2026-09-14T10:00:00.000Z',
    allDay: false,
    linkedNoteIds: [],
    linkedPdfIds: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...patch,
  }
}

const occurrencesOf = (e: CalendarEvent, from = new Date(2026, 8, 1), to = new Date(2026, 11, 31)) => expandEvents([e], from, to)

/** Unfold a document back into logical lines, the way a parser would. */
function logicalLines(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n').filter(Boolean)
}
const lineFor = (ics: string, prop: string) => logicalLines(ics).filter((l) => l.startsWith(prop))

describe('escapeText', () => {
  it('escapes the four characters RFC 5545 reserves', () => {
    expect(escapeText('a,b')).toBe('a\\,b')
    expect(escapeText('a;b')).toBe('a\\;b')
    expect(escapeText('a\\b')).toBe('a\\\\b')
    expect(escapeText('a\nb')).toBe('a\\nb')
    expect(escapeText('a\r\nb')).toBe('a\\nb')
  })
  it('escapes the backslash first, so an escape is not double-escaped', () => {
    // Getting the order wrong turns "\," into "\\," and the comma reappears
    // as a field separator.
    expect(escapeText('a\\,b')).toBe('a\\\\\\,b')
  })
  it('leaves ordinary text alone', () => {
    expect(escapeText('Linear Algebra 221')).toBe('Linear Algebra 221')
  })
})

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:Lecture')).toBe('SUMMARY:Lecture')
  })
  it('folds at 75 octets with a leading space on continuations', () => {
    const line = `SUMMARY:${'a'.repeat(200)}`
    const folded = foldLine(line)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    }
    for (const part of parts.slice(1)) expect(part.startsWith(' ')).toBe(true)
    expect(folded.replace(/\r\n /g, '')).toBe(line)
  })
  it('counts bytes, not characters', () => {
    // 40 three-byte characters is 120 octets but only 40 characters; folding
    // by character count would leave an over-long line.
    const line = `SUMMARY:${'字'.repeat(40)}`
    for (const part of foldLine(line).split('\r\n')) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    }
  })
  it('never splits a multi-byte character across a fold', () => {
    const line = `SUMMARY:${'é'.repeat(80)}`
    const folded = foldLine(line)
    expect(folded.replace(/\r\n /g, '')).toBe(line)
    // A split character would survive neither the round trip nor decoding.
    for (const part of folded.split('\r\n')) {
      const bytes = new TextEncoder().encode(part)
      expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toBe(part)
    }
  })
  it('round-trips an emoji, which is four bytes', () => {
    const line = `SUMMARY:${'🎓'.repeat(40)}`
    expect(foldLine(line).replace(/\r\n /g, '')).toBe(line)
  })
})

describe('buildIcs structure', () => {
  const ics = () => buildIcs(occurrencesOf(event()), { name: 'Notework', now: NOW })

  it('wraps the document correctly', () => {
    const lines = logicalLines(ics())
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines.at(-1)).toBe('END:VCALENDAR')
    expect(lines).toContain('VERSION:2.0')
    expect(lines.some((l) => l.startsWith('PRODID:'))).toBe(true)
  })
  it('uses CRLF throughout and ends with one', () => {
    const out = ics()
    expect(out.endsWith('\r\n')).toBe(true)
    expect(out.replace(/\r\n/g, '')).not.toContain('\n')
  })
  it('names the calendar', () => {
    expect(lineFor(ics(), 'X-WR-CALNAME:')).toEqual(['X-WR-CALNAME:Notework'])
  })
  it('pairs every BEGIN:VEVENT with an END:VEVENT', () => {
    const lines = logicalLines(buildIcs(occurrencesOf(event({ recurrence: { freq: 'weekly', interval: 1 } })), { now: NOW }))
    expect(lines.filter((l) => l === 'BEGIN:VEVENT').length).toBe(lines.filter((l) => l === 'END:VEVENT').length)
  })
})

describe('timed events', () => {
  it('writes start and end as UTC instants', () => {
    const ics = buildIcs(occurrencesOf(event()), { now: NOW })
    expect(lineFor(ics, 'DTSTART')).toEqual(['DTSTART:20260914T090000Z'])
    expect(lineFor(ics, 'DTEND')).toEqual(['DTEND:20260914T100000Z'])
  })
  it('carries title, location and description', () => {
    const ics = buildIcs(occurrencesOf(event({ location: 'Room 204', description: 'Bring the reader' })), { now: NOW })
    expect(lineFor(ics, 'SUMMARY:')).toEqual(['SUMMARY:Lecture'])
    expect(lineFor(ics, 'LOCATION:')).toEqual(['LOCATION:Room 204'])
    expect(lineFor(ics, 'DESCRIPTION:')[0]).toContain('Bring the reader')
  })
  it('labels assignments and exams in the summary', () => {
    const due = buildIcs(occurrencesOf(event({ kind: 'assignment', title: 'Problem set 3' })), { now: NOW })
    expect(lineFor(due, 'SUMMARY:')).toEqual(['SUMMARY:Due: Problem set 3'])
    const exam = buildIcs(occurrencesOf(event({ kind: 'exam', title: 'Midterm' })), { now: NOW })
    expect(lineFor(exam, 'SUMMARY:')).toEqual(['SUMMARY:Exam: Midterm'])
  })
})

describe('all-day events', () => {
  const allDay = event({ allDay: true, start: '2026-09-14T00:00:00.000Z', end: '2026-09-15T00:00:00.000Z' })

  it('uses DATE values, not timestamps', () => {
    const ics = buildIcs(occurrencesOf(allDay), { now: NOW })
    expect(lineFor(ics, 'DTSTART')[0]).toMatch(/^DTSTART;VALUE=DATE:\d{8}$/)
    expect(lineFor(ics, 'DTEND')[0]).toMatch(/^DTEND;VALUE=DATE:\d{8}$/)
  })
  it('keeps DTEND exclusive, so a one-day event covers one day', () => {
    const ics = buildIcs(occurrencesOf(allDay), { now: NOW })
    const start = lineFor(ics, 'DTSTART')[0].slice(-8)
    const end = lineFor(ics, 'DTEND')[0].slice(-8)
    expect(Number(end) - Number(start)).toBe(1)
  })
})

describe('recurring events', () => {
  const weekly = event({
    recurrence: { freq: 'weekly', interval: 1, byWeekday: [1] },
    start: '2026-09-14T09:00:00.000Z',
    end: '2026-09-14T10:00:00.000Z',
  })

  it('writes one VEVENT per occurrence rather than an RRULE', () => {
    const ics = buildIcs(occurrencesOf(weekly), { now: NOW })
    expect(lineFor(ics, 'DTSTART').length).toBeGreaterThan(4)
    expect(ics).not.toContain('RRULE')
  })
  it('gives every occurrence a distinct UID', () => {
    const uids = lineFor(buildIcs(occurrencesOf(weekly), { now: NOW }), 'UID:')
    expect(new Set(uids).size).toBe(uids.length)
  })
  it('omits deleted occurrences', () => {
    const occs = occurrencesOf(weekly)
    const withHole = occurrencesOf({ ...weekly, exdates: [occs[1].originalStart] })
    expect(withHole.length).toBe(occs.length - 1)
    expect(lineFor(buildIcs(withHole, { now: NOW }), 'UID:').length).toBe(occs.length - 1)
  })
  it('honours a per-occurrence retitle', () => {
    const occs = occurrencesOf(weekly)
    const edited = occurrencesOf({ ...weekly, overrides: { [occs[1].originalStart]: { title: 'Guest lecture' } } })
    expect(lineFor(buildIcs(edited, { now: NOW }), 'SUMMARY:')).toContain('SUMMARY:Guest lecture')
  })
})

describe('UIDs', () => {
  const stable = (e: CalendarEvent) => lineFor(buildIcs(occurrencesOf(e), { now: NOW }), 'UID:')

  it('stay the same across rebuilds, so refetching updates instead of duplicating', () => {
    expect(stable(event())).toEqual(stable(event()))
  })
  it('survive an unrelated edit to the event', () => {
    expect(stable(event({ location: 'Room 9' }))).toEqual(stable(event()))
  })
  it('contain only characters that are safe unescaped', () => {
    for (const uid of stable(event({ recurrence: { freq: 'weekly' } }))) {
      expect(uid.slice(4)).toMatch(/^[A-Za-z0-9@._\-+:]+$/)
    }
  })
  it('differ between two events', () => {
    const a = occurrencesOf(event({ id: 'a' }))[0]
    const b = occurrencesOf(event({ id: 'b' }))[0]
    expect(occurrenceUid(a)).not.toBe(occurrenceUid(b))
  })
})

describe('hostile input', () => {
  it('cannot inject properties through a title', () => {
    const nasty = event({ title: 'Exam\r\nDTSTART:19700101T000000Z\r\nSUMMARY:injected' })
    const ics = buildIcs(occurrencesOf(nasty), { now: NOW })
    expect(lineFor(ics, 'DTSTART').length).toBe(1)
    expect(lineFor(ics, 'SUMMARY:').length).toBe(1)
    expect(logicalLines(ics)).not.toContain('SUMMARY:injected')
    expect(logicalLines(ics)).not.toContain('DTSTART:19700101T000000Z')
  })
  it('escapes separators in a location', () => {
    const ics = buildIcs(occurrencesOf(event({ location: 'Hall A, Level 3; north' })), { now: NOW })
    expect(lineFor(ics, 'LOCATION:')).toEqual(['LOCATION:Hall A\\, Level 3\\; north'])
  })
  it('keeps long titles inside the octet limit', () => {
    const ics = buildIcs(occurrencesOf(event({ title: 'Astrophysics '.repeat(30) })), { now: NOW })
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
  })
})

describe('categories and alarms', () => {
  const categories: Category[] = [{ id: 'c1', name: 'Linear Algebra', color: '#4f6df5', createdAt: '2026-01-01T00:00:00.000Z', sortOrder: 0 }]

  it('names the class on the event', () => {
    const ics = buildIcs(occurrencesOf(event({ categoryId: 'c1' })), { categories, now: NOW })
    expect(lineFor(ics, 'CATEGORIES:')).toEqual(['CATEGORIES:Linear Algebra'])
    expect(lineFor(ics, 'DESCRIPTION:')[0]).toContain('Linear Algebra')
  })
  it('adds an alarm when one is asked for', () => {
    const ics = buildIcs(occurrencesOf(event({ kind: 'assignment' })), { alarmMinutesBefore: 60, now: NOW })
    expect(logicalLines(ics)).toContain('TRIGGER:-PT60M')
    expect(logicalLines(ics)).toContain('BEGIN:VALARM')
  })
  it('adds none by default', () => {
    expect(buildIcs(occurrencesOf(event()), { now: NOW })).not.toContain('VALARM')
  })
  it('limits alarms to the chosen kinds', () => {
    const events = [event({ id: 'a', kind: 'class', title: 'Lecture' }), event({ id: 'b', kind: 'exam', title: 'Midterm' }), event({ id: 'c', kind: 'assignment', title: 'Essay' })]
    const occs = expandEvents(events, new Date(2026, 8, 1), new Date(2026, 9, 1))
    const ics = buildIcs(occs, { alarmMinutesBefore: 60, alarmKinds: ['assignment', 'exam'], now: NOW })

    // One alarm each for the exam and the essay; none for the lecture.
    expect((ics.match(/BEGIN:VALARM/g) ?? []).length).toBe(2)
    const alarmed = logicalLines(ics)
      .join('\n')
      .split('BEGIN:VEVENT')
      .filter((block) => block.includes('BEGIN:VALARM'))
    expect(alarmed.some((b) => b.includes('Midterm'))).toBe(true)
    expect(alarmed.some((b) => b.includes('Essay'))).toBe(true)
    expect(alarmed.some((b) => b.includes('Lecture'))).toBe(false)
  })
  it('alarms every kind when none is specified', () => {
    const events = [event({ id: 'a', kind: 'class' }), event({ id: 'b', kind: 'exam' })]
    const occs = expandEvents(events, new Date(2026, 8, 1), new Date(2026, 9, 1))
    expect((buildIcs(occs, { alarmMinutesBefore: 60, now: NOW }).match(/BEGIN:VALARM/g) ?? []).length).toBe(2)
  })
  it('adds no alarms when the list is empty', () => {
    const ics = buildIcs(occurrencesOf(event({ kind: 'exam' })), { alarmMinutesBefore: 60, alarmKinds: [], now: NOW })
    expect(ics).not.toContain('VALARM')
  })
  it('still shows the event itself when its kind is not alarmed', () => {
    const ics = buildIcs(occurrencesOf(event({ kind: 'class' })), { alarmMinutesBefore: 60, alarmKinds: ['exam'], now: NOW })
    expect(lineFor(ics, 'SUMMARY:').length).toBe(1)
    expect(ics).not.toContain('VALARM')
  })
  it('does not nag about something already done', () => {
    const done = occurrencesOf(event({ kind: 'assignment', completed: true }))
    const ics = buildIcs(done, { alarmMinutesBefore: 60, now: NOW })
    expect(ics).not.toContain('VALARM')
    expect(logicalLines(ics)).toContain('STATUS:CANCELLED')
  })
})

describe('buildIcsFeed', () => {
  it('covers a window around now without being given a range', () => {
    const weekly = event({ recurrence: { freq: 'weekly', interval: 1 }, start: '2026-09-14T09:00:00.000Z', end: '2026-09-14T10:00:00.000Z' })
    const ics = buildIcsFeed([weekly], { now: NOW })
    expect(lineFor(ics, 'DTSTART').length).toBeGreaterThan(40)
  })
  it('produces a valid empty calendar when there is nothing to show', () => {
    const ics = buildIcsFeed([], { name: 'Notework', now: NOW })
    expect(logicalLines(ics)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0', expect.stringContaining('PRODID:'), 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Notework', 'NAME:Notework', 'END:VCALENDAR'])
  })
  it('is stable between two builds at the same instant', () => {
    expect(buildIcsFeed([event()], { now: NOW })).toBe(buildIcsFeed([event()], { now: NOW }))
  })
})

describe('every occurrence reaches the file', () => {
  it('emits exactly one VEVENT per expanded occurrence', () => {
    const events = [event({ id: 'a', recurrence: { freq: 'weekly', byWeekday: [1, 3] } }), event({ id: 'b', kind: 'exam', title: 'Midterm' }), event({ id: 'c', allDay: true, title: 'Reading week' })]
    const occs: Occurrence[] = expandEvents(events, new Date(2026, 8, 1), new Date(2026, 10, 1))
    const ics = buildIcs(occs, { now: NOW })
    expect(lineFor(ics, 'UID:').length).toBe(occs.length)
  })
})
