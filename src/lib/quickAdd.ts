import * as chrono from 'chrono-node'
import { addDays, addHours, addMinutes, startOfDay } from 'date-fns'
import type { Category, EventKind, Priority, RecurrenceRule, Weekday } from '../types/models'

export interface ParsedQuickAdd {
  title: string
  kind: EventKind
  categoryId: string | null
  start: Date
  end: Date
  allDay: boolean
  recurrence?: RecurrenceRule
  priority?: Priority
  location?: string
  /** Which parts of the input were recognised, for UI highlighting. */
  matched: { date?: string; category?: string; recurrence?: string; kind?: string; location?: string }
  /** True when no date at all was found; the caller may pick a default. */
  dateGuessed: boolean
}

const WEEKDAY_NAMES: Record<string, Weekday> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
}
const WD = Object.keys(WEEKDAY_NAMES).sort((a, b) => b.length - a.length).join('|')

const KIND_PATTERNS: [RegExp, EventKind][] = [
  [/\b(midterm|final exam|final|exam|quiz|test)\b/i, 'exam'],
  [/\b(due|homework|hw|assignment|problem set|pset|essay|paper|report|project|lab report|submit|submission|reading)\b/i, 'assignment'],
  [/\b(class|lecture|lab|seminar|tutorial|section|recitation|office hours)\b/i, 'class'],
]

function stripSpan(text: string, match: RegExpMatchArray | null): string {
  if (!match || match.index === undefined) return text
  return text.slice(0, match.index) + ' ' + text.slice(match.index + match[0].length)
}

function tidyTitle(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '')
    .replace(/\b(on|at|by|for|from|in|the|due|every|until|till)\s*$/i, '')
    .replace(/^\s*(on|at|by|for|from|in|due)\b\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseRecurrence(text: string, now: Date): { rule: RecurrenceRule; rest: string; matchedText: string; firstDay?: Weekday[] } | null {
  // every day / daily
  let m = text.match(/\b(every\s*day|daily|everyday)\b/i)
  if (m) return { rule: { freq: 'daily' }, rest: stripSpan(text, m), matchedText: m[0] }
  // every other week / biweekly / every 2 weeks (+ optional weekdays)
  m = text.match(new RegExp(`\\b(every\\s+other\\s+week|biweekly|every\\s+(\\d+)\\s+weeks?)(?:\\s+on)?((?:\\s*(?:and|,|/|&)?\\s*(?:${WD})s?)*)`, 'i'))
  if (m) {
    const interval = m[2] ? parseInt(m[2], 10) : 2
    const days = extractWeekdays(m[3] ?? '')
    return { rule: { freq: 'weekly', interval, byWeekday: days.length ? days : undefined }, rest: stripSpan(text, m), matchedText: m[0], firstDay: days }
  }
  // every mon/wed, every monday and wednesday, weekly on tue, every week
  m = text.match(new RegExp(`\\b(every|weekly(?:\\s+on)?|each)\\b((?:\\s*(?:and|,|/|&)?\\s*(?:${WD})s?)+)`, 'i'))
  if (m) {
    const days = extractWeekdays(m[2])
    return { rule: { freq: 'weekly', byWeekday: days }, rest: stripSpan(text, m), matchedText: m[0], firstDay: days }
  }
  m = text.match(/\b(every\s+week|weekly)\b/i)
  if (m) return { rule: { freq: 'weekly', byWeekday: [now.getDay() as Weekday] }, rest: stripSpan(text, m), matchedText: m[0] }
  return null
}

function extractWeekdays(s: string): Weekday[] {
  const out = new Set<Weekday>()
  for (const [, name] of s.matchAll(new RegExp(`\\b(${WD})s?\\b`, 'gi'))) out.add(WEEKDAY_NAMES[name.toLowerCase()])
  return [...out].sort()
}

function parseDuration(text: string): { minutes: number; rest: string } | null {
  const m = text.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i)
  if (!m) return null
  const n = parseFloat(m[1])
  const unit = m[2].toLowerCase()
  const minutes = unit.startsWith('h') ? n * 60 : n
  return { minutes, rest: stripSpan(text, m) }
}

function parsePriority(text: string): { priority: Priority; rest: string } | null {
  let m = text.match(/\b(high|top|urgent)\s*(priority|prio)?\b/i)
  if (m && (m[2] || /urgent/i.test(m[1]))) return { priority: 'high', rest: stripSpan(text, m) }
  m = text.match(/\b(medium|med|normal)\s*(priority|prio)\b/i)
  if (m) return { priority: 'medium', rest: stripSpan(text, m) }
  m = text.match(/\b(low)\s*(priority|prio)\b/i)
  if (m) return { priority: 'low', rest: stripSpan(text, m) }
  m = text.match(/(!{1,3})\s*$/)
  if (m) return { priority: m[1].length >= 2 ? 'high' : 'medium', rest: stripSpan(text, m) }
  return null
}

function parseCategory(text: string, categories: Category[]): { category: Category; rest: string; matchedText: string } | null {
  // Longest names first so "Physics 201" beats "Physics".
  const candidates = categories
    .flatMap((c) => [
      { c, key: c.name },
      ...(c.code ? [{ c, key: c.code }] : []),
      // First word of a multi-word name ("Physics" for "Physics 201") as a weaker match.
      ...(c.name.includes(' ') ? [{ c, key: c.name.split(' ')[0] }] : []),
    ])
    .filter((x) => x.key.length >= 3)
    .sort((a, b) => b.key.length - a.key.length)
  for (const { c, key } of candidates) {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = text.match(new RegExp(`(?:#|\\bfor\\s+)?\\b${esc}\\b`, 'i'))
    if (m) return { category: c, rest: stripSpan(text, m), matchedText: m[0] }
  }
  // Fallback: a word in the input that is a prefix of a class word ("Chem" → "Chemistry", "CHEM 210").
  const words: { c: Category; word: string }[] = categories.flatMap((c) =>
    `${c.name} ${c.code ?? ''}`
      .split(/\s+/)
      .filter((w) => /^[a-z]{4,}$/i.test(w))
      .map((word) => ({ c, word: word.toLowerCase() })),
  )
  for (const m of text.matchAll(/(?:#|\bfor\s+)?\b([a-z]{3,})\b/gi)) {
    const token = m[1].toLowerCase()
    if (STOPWORDS.has(token)) continue
    const hit = words.find((w) => w.word.startsWith(token))
    if (hit) return { category: hit.c, rest: stripSpan(text, m), matchedText: m[0] }
  }
  return null
}

const STOPWORDS = new Set(['the', 'and', 'for', 'due', 'every', 'until', 'from', 'with', 'next', 'this', 'tomorrow', 'today', 'tonight'])

function parseLocation(text: string): { location: string; rest: string } | null {
  let m = text.match(/\s@\s*([^@]+?)\s*$/)
  if (m) return { location: m[1].trim(), rest: stripSpan(text, m) }
  m = text.match(/\b(?:in|at)\s+((?:room|rm|hall|building|bldg|lab|library|zoom|online)\b[^,]*|[A-Z][\w-]*(?:\s+\d+[A-Za-z]?)?)\s*$/)
  if (m) return { location: m[1].trim(), rest: stripSpan(text, m) }
  return null
}

/**
 * Turn "Physics HW due Friday 11pm" into a structured event draft.
 * Uses chrono-node for the date/time so a wide range of phrasings work.
 */
export function parseQuickAdd(input: string, opts: { now?: Date; categories?: Category[]; defaultDurationMin?: number } = {}): ParsedQuickAdd | null {
  const now = opts.now ?? new Date()
  const categories = opts.categories ?? []
  let text = input.replace(/\s+/g, ' ').trim()
  if (!text) return null
  const matched: ParsedQuickAdd['matched'] = {}

  // Kind
  let kind: EventKind = 'event'
  for (const [re, k] of KIND_PATTERNS) {
    const m = text.match(re)
    if (m) {
      kind = k
      matched.kind = m[0]
      break
    }
  }

  // Priority
  let priority: Priority | undefined
  const pr = parsePriority(text)
  if (pr) {
    priority = pr.priority
    text = pr.rest
  }

  // Category
  let categoryId: string | null = null
  const cat = parseCategory(text, categories)
  if (cat) {
    categoryId = cat.category.id
    matched.category = cat.matchedText
    text = cat.rest
  }

  // Recurrence
  let recurrence: RecurrenceRule | undefined
  let recurDays: Weekday[] | undefined
  const rec = parseRecurrence(text, now)
  if (rec) {
    recurrence = rec.rule
    recurDays = rec.firstDay
    matched.recurrence = rec.matchedText
    text = rec.rest
  }

  // Duration
  let durationMin: number | null = null
  const dur = parseDuration(text)
  if (dur) {
    durationMin = dur.minutes
    text = dur.rest
  }

  // "until <date>" belongs to the recurrence; take it out before the main parse
  // so chrono doesn't read "6pm until Dec 1" as a range.
  const untilMatch = text.match(/\b(until|till|through|thru)\s+(.+)$/i)
  if (recurrence && untilMatch) {
    const u = chrono.parseDate(untilMatch[2], now, { forwardDate: true })
    if (u) {
      recurrence = { ...recurrence, until: startOfDay(u).toISOString() }
      text = stripSpan(text, untilMatch)
    }
  }

  // Date/time via chrono
  const results = chrono.parse(text, now, { forwardDate: true })
  let start: Date
  let end: Date | null = null
  let allDay = false
  let dateGuessed = false
  const r = results[0]
  if (r) {
    matched.date = r.text
    start = r.start.date()
    // chrono marks "tonight"/"noon" as implied hours; they're still times.
    const hasTime = r.start.isCertain('hour') || /\b(tonight|morning|afternoon|evening|noon|midnight)\b/i.test(r.text)
    if (!hasTime) {
      allDay = true
      start = startOfDay(start)
    }
    // "every mon/wed 10am": chrono only saw a time, so anchor to the next
    // recurrence weekday rather than today.
    const dayCertain = r.start.isCertain('day') || r.start.isCertain('weekday')
    if (recurDays && recurDays.length && !dayCertain) {
      let d = startOfDay(now)
      for (let i = 0; i < 8; i++) {
        if (recurDays.includes(d.getDay() as Weekday) && (i > 0 || allDay || start.getTime() > now.getTime())) break
        d = addDays(d, 1)
      }
      start = allDay ? d : new Date(d.getFullYear(), d.getMonth(), d.getDate(), start.getHours(), start.getMinutes())
    }
    if (r.end) {
      end = r.end.date()
      if (!r.end.isCertain('hour')) end = addDays(startOfDay(end), 1)
    }
    text = text.slice(0, r.index) + ' ' + text.slice(r.index + r.text.length)
  } else {
    dateGuessed = true
    if (recurDays && recurDays.length) {
      // Next matching weekday.
      let d = startOfDay(now)
      for (let i = 0; i < 8; i++) {
        if (recurDays.includes(d.getDay() as Weekday)) break
        d = addDays(d, 1)
      }
      start = d
    } else {
      start = startOfDay(now)
    }
    allDay = true
  }

  // If the recurrence has weekdays but the parsed date isn't one of them, keep
  // the date's weekday too so the first occurrence is what the user typed.
  if (recurrence?.freq === 'weekly' && recurrence.byWeekday && !recurrence.byWeekday.includes(start.getDay() as Weekday) && !dateGuessed) {
    recurrence = { ...recurrence, byWeekday: [...recurrence.byWeekday, start.getDay() as Weekday].sort() as Weekday[] }
  }

  // Location (after chrono so "at 5pm" is gone)
  let location: string | undefined
  const loc = parseLocation(text)
  if (loc) {
    location = loc.location
    matched.location = loc.location
    text = loc.rest
  }

  // End time
  if (!end) {
    if (allDay) end = addDays(start, 1)
    else if (kind === 'assignment' && durationMin === null) end = start
    else end = addMinutes(start, durationMin ?? opts.defaultDurationMin ?? 60)
  } else if (durationMin !== null && !allDay) {
    end = addMinutes(start, durationMin)
  }
  if (!allDay && end <= start && kind !== 'assignment') end = addHours(start, 1)

  const title = tidyTitle(text) || (matched.kind ? matched.kind[0].toUpperCase() + matched.kind.slice(1) : 'Untitled')

  return { title, kind, categoryId, start, end, allDay, recurrence, priority, location, matched, dateGuessed }
}
