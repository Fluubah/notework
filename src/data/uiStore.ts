import { create } from 'zustand'
import type { Occurrence, Priority, RecurrenceRule } from '../types/models'

export type Section = 'calendar' | 'notes' | 'tasks'
export type CalendarView = 'week' | 'month'

/** Draft passed to the event editor when creating. */
export interface EventDraft {
  start: Date
  end: Date
  allDay: boolean
  title?: string
  kind?: 'class' | 'assignment' | 'exam' | 'event'
  categoryId?: string | null
  recurrence?: RecurrenceRule
  priority?: Priority
  location?: string
}

export interface EditorState {
  mode: 'create' | 'edit'
  draft?: EventDraft
  occurrence?: Occurrence
}

export interface UiState {
  section: Section
  setSection(s: Section): void
  calendarView: CalendarView
  setCalendarView(v: CalendarView): void
  anchorDate: Date
  setAnchorDate(d: Date): void
  sidebarOpen: boolean
  toggleSidebar(): void
  editor: EditorState | null
  openEditor(e: EditorState): void
  closeEditor(): void
  /** Occurrence whose detail popover is open (by occurrence id). */
  selectedOccurrenceId: string | null
  selectOccurrence(id: string | null): void
  /** Category ids currently hidden on the calendar. */
  hiddenCategoryIds: Set<string>
  toggleCategoryHidden(id: string): void
  showAllCategories(): void
  categoriesOpen: boolean
  setCategoriesOpen(v: boolean): void
  settingsOpen: boolean
  setSettingsOpen(v: boolean): void
  shortcutsOpen: boolean
  setShortcutsOpen(v: boolean): void
  quickAddOpen: boolean
  setQuickAddOpen(v: boolean): void
  // notes
  selectedNoteId: string | null
  selectNote(id: string | null): void
  selectedPdfId: string | null
  selectPdf(id: string | null): void
  notesFilter: { categoryId: string | null; folderId: string | null } | null
  setNotesFilter(f: { categoryId: string | null; folderId: string | null } | null): void
}

export const useUi = create<UiState>()((set) => ({
  section: 'calendar',
  setSection: (section) => set({ section }),
  calendarView: 'week',
  setCalendarView: (calendarView) => set({ calendarView }),
  anchorDate: new Date(),
  setAnchorDate: (anchorDate) => set({ anchorDate }),
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  editor: null,
  openEditor: (editor) => set({ editor, selectedOccurrenceId: null }),
  closeEditor: () => set({ editor: null }),
  selectedOccurrenceId: null,
  selectOccurrence: (selectedOccurrenceId) => set({ selectedOccurrenceId }),
  hiddenCategoryIds: new Set(),
  toggleCategoryHidden: (id) =>
    set((s) => {
      const next = new Set(s.hiddenCategoryIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { hiddenCategoryIds: next }
    }),
  showAllCategories: () => set({ hiddenCategoryIds: new Set() }),
  categoriesOpen: false,
  setCategoriesOpen: (categoriesOpen) => set({ categoriesOpen }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  shortcutsOpen: false,
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  quickAddOpen: false,
  setQuickAddOpen: (quickAddOpen) => set({ quickAddOpen }),
  selectedNoteId: null,
  selectNote: (selectedNoteId) => set((s) => ({ selectedNoteId, selectedPdfId: selectedNoteId ? null : s.selectedPdfId })),
  selectedPdfId: null,
  selectPdf: (selectedPdfId) => set((s) => ({ selectedPdfId, selectedNoteId: selectedPdfId ? null : s.selectedNoteId })),
  notesFilter: null,
  setNotesFilter: (notesFilter) => set({ notesFilter }),
}))
