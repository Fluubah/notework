import { useEffect } from 'react'
import { ToastHost } from './components/Toast'
import { useStore } from './data/store'
import { useUi } from './data/uiStore'
import { CalendarPage } from './features/calendar/CalendarPage'
import { EventEditor } from './features/calendar/EventEditor'
import { NotesPage } from './features/notes/NotesPage'
import { TasksPage } from './features/tasks/TasksPage'
import { useHotkeys } from './hooks/useHotkeys'
import { useApplyTheme } from './hooks/useTheme'
import { CategoryManager } from './features/shell/CategoryManager'
import { SettingsDialog } from './features/shell/SettingsDialog'
import { ShortcutsDialog } from './features/shell/ShortcutsDialog'
import { Sidebar } from './features/shell/Sidebar'
import { QuickAdd } from './features/calendar/QuickAdd'

export function App() {
  const hydrated = useStore((s) => s.hydrated)
  const hydrate = useStore((s) => s.hydrate)
  const section = useUi((s) => s.section)
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const setSidebarOpen = useUi((s) => s.setSidebarOpen)
  const ui = useUi()
  useApplyTheme()

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useHotkeys(
    [
      { combo: '1', handler: () => ui.setSection('calendar') },
      { combo: '2', handler: () => ui.setSection('notes') },
      { combo: '3', handler: () => ui.setSection('tasks') },
      { combo: 'mod+\\', handler: () => ui.toggleSidebar(), allowInInput: true },
      { combo: 'mod+k', handler: () => ui.setQuickAddOpen(true), allowInInput: true },
      { combo: 'shift+?', handler: () => ui.setShortcutsOpen(!ui.shortcutsOpen) },
      { combo: 'mod+,', handler: () => ui.setSettingsOpen(true), allowInInput: true },
    ],
    [ui.shortcutsOpen],
  )

  if (!hydrated) return null

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open-mobile' : 'sidebar-collapsed'}`}>
      <Sidebar />
      {/* Scrim behind the mobile drawer; hidden by CSS on wider screens. */}
      <div
        className="sidebar-scrim"
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <main className="main">
        {section === 'calendar' && <CalendarPage />}
        {section === 'notes' && <NotesPage />}
        {section === 'tasks' && <TasksPage />}
      </main>
      <EventEditor />
      <QuickAdd />
      <CategoryManager />
      <SettingsDialog />
      <ShortcutsDialog />
      <ToastHost />
    </div>
  )
}
