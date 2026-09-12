import { create } from 'zustand'
import { newId } from '../lib/ids'
import { withOccurrenceDeleted, withOccurrenceOverride, withSeriesUpdated } from '../lib/recurrence'
import {
  emptyAppData,
  type Annotation,
  type AppData,
  type CalendarEvent,
  type Category,
  type Folder,
  type Note,
  type OccurrenceOverride,
  type PdfDocument,
  type Settings,
} from '../types/models'
import { fileStore, repository } from './index'

type Patch<T> = Partial<Omit<T, 'id' | 'createdAt'>>

export interface AppState extends AppData {
  hydrated: boolean
  /** Bump to force re-render of "now"-dependent UI; kept out of persistence. */
  hydrate(): Promise<void>
  resetAll(): Promise<void>
  importData(data: AppData): void

  // categories
  addCategory(input: { name: string; color: string; code?: string }): Category
  updateCategory(id: string, patch: Patch<Category>): void
  deleteCategory(id: string): void

  // events
  addEvent(input: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt' | 'linkedNoteIds' | 'linkedPdfIds'> & Partial<Pick<CalendarEvent, 'linkedNoteIds' | 'linkedPdfIds'>>): CalendarEvent
  updateEvent(id: string, patch: Patch<CalendarEvent>): void
  /** Edit the whole series (clears per-occurrence exceptions if the schedule changed). */
  updateSeries(id: string, patch: Patch<CalendarEvent>): void
  /** Edit one occurrence of a recurring event. */
  updateOccurrence(id: string, originalStart: string, patch: OccurrenceOverride): void
  deleteEvent(id: string): void
  deleteOccurrence(id: string, originalStart: string): void
  toggleCompleted(id: string, originalStart: string | null): void

  // folders
  addFolder(input: { name: string; categoryId: string | null }): Folder
  updateFolder(id: string, patch: Patch<Folder>): void
  deleteFolder(id: string): void

  // notes
  addNote(input: { title?: string; categoryId: string | null; folderId: string | null }): Note
  updateNote(id: string, patch: Patch<Note>): void
  deleteNote(id: string): void

  // pdfs
  addPdf(meta: Omit<PdfDocument, 'id' | 'createdAt' | 'updatedAt'>): PdfDocument
  updatePdf(id: string, patch: Patch<PdfDocument>): void
  deletePdf(id: string): Promise<void>

  // annotations
  addAnnotation(a: Omit<Annotation, 'id' | 'createdAt'>): Annotation
  updateAnnotation(id: string, patch: Partial<Annotation>): void
  deleteAnnotation(id: string): void
  deleteAnnotations(ids: string[]): void

  // settings
  updateSettings(patch: Partial<Settings>): void
}

const now = () => new Date().toISOString()

function pickData(state: AppState): AppData {
  const { version, categories, events, folders, notes, pdfs, annotations, settings } = state
  return { version, categories, events, folders, notes, pdfs, annotations, settings }
}

export const useStore = create<AppState>()((set, get) => ({
  ...emptyAppData(),
  hydrated: false,

  async hydrate() {
    const data = await repository.load()
    set({ ...(data ?? emptyAppData()), hydrated: true })
  },
  async resetAll() {
    await repository.clear()
    await fileStore.clear()
    set({ ...emptyAppData() })
  },
  importData(data) {
    set({ ...data })
  },

  addCategory({ name, color, code }) {
    const cat: Category = { id: newId(), name, color, code, createdAt: now(), sortOrder: get().categories.length }
    set((s) => ({ categories: [...s.categories, cat] }))
    return cat
  },
  updateCategory(id, patch) {
    set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  },
  deleteCategory(id) {
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== id),
      events: s.events.map((e) => (e.categoryId === id ? { ...e, categoryId: null } : e)),
      notes: s.notes.map((n) => (n.categoryId === id ? { ...n, categoryId: null } : n)),
      pdfs: s.pdfs.map((p) => (p.categoryId === id ? { ...p, categoryId: null } : p)),
      folders: s.folders.map((f) => (f.categoryId === id ? { ...f, categoryId: null } : f)),
    }))
  },

  addEvent(input) {
    const ev: CalendarEvent = {
      linkedNoteIds: [],
      linkedPdfIds: [],
      ...input,
      id: newId(),
      createdAt: now(),
      updatedAt: now(),
    }
    set((s) => ({ events: [...s.events, ev] }))
    return ev
  },
  updateEvent(id, patch) {
    set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: now() } : e)) }))
  },
  updateSeries(id, patch) {
    set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...withSeriesUpdated(e, patch), updatedAt: now() } : e)) }))
  },
  updateOccurrence(id, originalStart, patch) {
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? { ...withOccurrenceOverride(e, originalStart, patch), updatedAt: now() } : e)),
    }))
  },
  deleteEvent(id) {
    set((s) => ({ events: s.events.filter((e) => e.id !== id) }))
  },
  deleteOccurrence(id, originalStart) {
    set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...withOccurrenceDeleted(e, originalStart), updatedAt: now() } : e)) }))
  },
  toggleCompleted(id, originalStart) {
    const ev = get().events.find((e) => e.id === id)
    if (!ev) return
    if (ev.recurrence && originalStart) {
      const current = ev.overrides?.[originalStart]?.completed ?? ev.completed ?? false
      get().updateOccurrence(id, originalStart, { completed: !current })
    } else {
      get().updateEvent(id, { completed: !(ev.completed ?? false) })
    }
  },

  addFolder({ name, categoryId }) {
    const f: Folder = { id: newId(), name, categoryId, createdAt: now(), sortOrder: get().folders.length }
    set((s) => ({ folders: [...s.folders, f] }))
    return f
  },
  updateFolder(id, patch) {
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
  },
  deleteFolder(id) {
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      notes: s.notes.map((n) => (n.folderId === id ? { ...n, folderId: null } : n)),
      pdfs: s.pdfs.map((p) => (p.folderId === id ? { ...p, folderId: null } : p)),
    }))
  },

  addNote({ title = '', categoryId, folderId }) {
    const n: Note = {
      id: newId(),
      title,
      content: null,
      excerpt: '',
      categoryId,
      folderId,
      pinned: false,
      createdAt: now(),
      updatedAt: now(),
    }
    set((s) => ({ notes: [n, ...s.notes] }))
    return n
  },
  updateNote(id, patch) {
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: now() } : n)) }))
  },
  deleteNote(id) {
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      events: s.events.map((e) => (e.linkedNoteIds.includes(id) ? { ...e, linkedNoteIds: e.linkedNoteIds.filter((x) => x !== id) } : e)),
    }))
  },

  addPdf(meta) {
    const p: PdfDocument = { ...meta, id: newId(), createdAt: now(), updatedAt: now() }
    set((s) => ({ pdfs: [p, ...s.pdfs] }))
    return p
  },
  updatePdf(id, patch) {
    set((s) => ({ pdfs: s.pdfs.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now() } : p)) }))
  },
  async deletePdf(id) {
    const pdf = get().pdfs.find((p) => p.id === id)
    set((s) => ({
      pdfs: s.pdfs.filter((p) => p.id !== id),
      annotations: s.annotations.filter((a) => a.pdfId !== id),
      events: s.events.map((e) => (e.linkedPdfIds.includes(id) ? { ...e, linkedPdfIds: e.linkedPdfIds.filter((x) => x !== id) } : e)),
    }))
    if (pdf) await fileStore.delete(pdf.fileKey)
  },

  addAnnotation(a) {
    const ann = { ...a, id: newId(), createdAt: now() } as Annotation
    set((s) => ({ annotations: [...s.annotations, ann] }))
    return ann
  },
  updateAnnotation(id, patch) {
    set((s) => ({ annotations: s.annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)) }))
  },
  deleteAnnotation(id) {
    set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) }))
  },
  deleteAnnotations(ids) {
    const del = new Set(ids)
    set((s) => ({ annotations: s.annotations.filter((a) => !del.has(a.id)) }))
  },

  updateSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }))
  },
}))

// ---- Persistence: debounce writes so typing in a note doesn't hammer storage.
let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSaved: AppData | null = null

function scheduleSave(state: AppState) {
  if (!state.hydrated) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    const data = pickData(state)
    lastSaved = data
    void repository.save(data)
  }, 250)
}

useStore.subscribe((state, prev) => {
  // The hydration transition itself is not a change worth persisting.
  if (!state.hydrated || !prev.hydrated) return
  const a = pickData(state)
  const b = pickData(prev)
  // Only save when a persisted slice actually changed (referential check).
  if ((Object.keys(a) as (keyof AppData)[]).some((k) => a[k] !== b[k])) scheduleSave(state)
})

/** Flush a pending save immediately (e.g. on page hide). */
export function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    const data = pickData(useStore.getState())
    if (data !== lastSaved) void repository.save(data)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave()
  })
}

// ---- Selectors
export const selectCategoryMap = (s: AppState) => new Map(s.categories.map((c) => [c.id, c]))
