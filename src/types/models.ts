/**
 * Core domain models. Everything persisted lives here so the data layer,
 * store, and UI all agree on one shape.
 *
 * Dates are stored as ISO-8601 strings (local wall-clock with offset) so the
 * data is JSON-serialisable and backend-friendly. Convert with `parseISO`.
 */

export type ID = string

/** A class or user-defined category. Users pick the name and colour. */
export interface Category {
  id: ID
  name: string
  /** Any CSS colour, typically a hex string chosen by the user. */
  color: string
  /** Optional short code shown in tight spaces (e.g. "PHYS 101"). */
  code?: string
  createdAt: string
  sortOrder: number
}

export type EventKind = 'class' | 'assignment' | 'exam' | 'event'
export type Priority = 'low' | 'medium' | 'high'

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // Sunday = 0

export interface RecurrenceRule {
  freq: 'daily' | 'weekly'
  /** Every N days / weeks. Defaults to 1. */
  interval?: number
  /** For weekly rules: which weekdays. Defaults to the weekday of `start`. */
  byWeekday?: Weekday[]
  /** Inclusive end date (ISO). Omit for "forever". */
  until?: string
  /** Maximum number of occurrences. */
  count?: number
}

/**
 * Per-occurrence override of a recurring event. Keyed by the *original*
 * occurrence start (ISO string) so it survives edits to the series.
 */
export interface OccurrenceOverride {
  title?: string
  start?: string
  end?: string
  location?: string
  description?: string
  categoryId?: ID | null
  completed?: boolean
}

export interface CalendarEvent {
  id: ID
  title: string
  kind: EventKind
  categoryId: ID | null
  /** ISO start. For all-day events this is local midnight of the day. */
  start: string
  /** ISO end (exclusive). For all-day events equals start + N days. */
  end: string
  allDay: boolean
  location?: string
  description?: string
  recurrence?: RecurrenceRule
  /** Occurrence start ISO strings that have been deleted from the series. */
  exdates?: string[]
  /** Occurrence-specific edits, keyed by original occurrence start ISO. */
  overrides?: Record<string, OccurrenceOverride>
  /** Task-ish fields, meaningful for assignments/exams. */
  completed?: boolean
  priority?: Priority
  /** Phase 4: linked notebook items. */
  linkedNoteIds: ID[]
  linkedPdfIds: ID[]
  createdAt: string
  updatedAt: string
}

/**
 * A concrete instance of an event on the calendar. Non-recurring events
 * produce exactly one occurrence; recurring events produce many.
 */
export interface Occurrence {
  /** Stable id: `${eventId}` for singles, `${eventId}@${originalStart}` for series. */
  id: string
  eventId: ID
  event: CalendarEvent
  /** ISO of the original (un-overridden) occurrence start; the override key. */
  originalStart: string
  start: Date
  end: Date
  title: string
  allDay: boolean
  categoryId: ID | null
  kind: EventKind
  location?: string
  description?: string
  completed: boolean
  isRecurring: boolean
  isOverridden: boolean
}

export interface Folder {
  id: ID
  name: string
  /** Folders live inside a class, or at the top level when null. */
  categoryId: ID | null
  createdAt: string
  sortOrder: number
}

export interface Note {
  id: ID
  title: string
  /** TipTap/ProseMirror JSON document. */
  content: unknown
  /** Plain-text excerpt for previews and search. */
  excerpt: string
  categoryId: ID | null
  folderId: ID | null
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface PdfDocument {
  id: ID
  name: string
  categoryId: ID | null
  folderId: ID | null
  size: number
  pageCount: number
  /** The binary lives in the FileStore under this key. */
  fileKey: string
  createdAt: string
  updatedAt: string
  /** Last viewed page, restored on open. */
  lastPage?: number
}

export type AnnotationTool = 'ink' | 'highlight' | 'text' | 'sticky' | 'eraser' | 'select'

/** A point in PDF user space (points, origin top-left, unrotated page). */
export interface PdfPoint {
  x: number
  y: number
}

export interface InkAnnotation {
  id: ID
  pdfId: ID
  page: number
  type: 'ink'
  color: string
  /** Stroke width in PDF points. */
  width: number
  /** Each stroke is a polyline in PDF page space. */
  strokes: PdfPoint[][]
  createdAt: string
}

export interface HighlightAnnotation {
  id: ID
  pdfId: ID
  page: number
  type: 'highlight'
  color: string
  /** Rectangles in PDF page space. */
  rects: { x: number; y: number; w: number; h: number }[]
  createdAt: string
}

export interface TextAnnotation {
  id: ID
  pdfId: ID
  page: number
  type: 'text'
  color: string
  x: number
  y: number
  w: number
  /** Font size in PDF points. */
  fontSize: number
  text: string
  createdAt: string
}

export interface StickyAnnotation {
  id: ID
  pdfId: ID
  page: number
  type: 'sticky'
  color: string
  x: number
  y: number
  text: string
  createdAt: string
}

export type Annotation = InkAnnotation | HighlightAnnotation | TextAnnotation | StickyAnnotation

export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemeMode
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1
  /** Hour the week view scrolls to on open. */
  dayStartHour: number
  showCompleted: boolean
}

/** Everything the app persists. */
export interface AppData {
  version: number
  categories: Category[]
  events: CalendarEvent[]
  folders: Folder[]
  notes: Note[]
  pdfs: PdfDocument[]
  annotations: Annotation[]
  settings: Settings
}

export const DATA_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  weekStartsOn: 1,
  dayStartHour: 8,
  showCompleted: true,
}

export function emptyAppData(): AppData {
  return {
    version: DATA_VERSION,
    categories: [],
    events: [],
    folders: [],
    notes: [],
    pdfs: [],
    annotations: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}
