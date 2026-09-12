import { IconSparkle } from './Icons'

/**
 * Placeholder shown while the store hydrates, in place of the blank window
 * that returning null left behind. It mirrors the real shell -- sidebar
 * column, topbar, content grid -- so nothing jumps when the app takes over.
 */
export function AppSkeleton({ sidebarOpen }: { sidebarOpen: boolean }) {
  return (
    <div className={`app skeleton-root ${sidebarOpen ? 'sidebar-open-mobile' : 'sidebar-collapsed'}`} role="status" aria-live="polite">
      <span className="sr-only">Loading your calendar…</span>
      <aside className="sidebar" aria-hidden="true">
        <div className="brand">
          <div className="brand-mark">
            <IconSparkle />
          </div>
          Notework
        </div>
        <div className="sk-line nav" />
        <div className="sk-line nav" />
        <div className="sk-line nav" />
        <div className="sk-block mini-cal-ph" />
        <div className="sk-line title" />
        <div className="sk-line row" />
        <div className="sk-line row" />
      </aside>
      <main className="main" aria-hidden="true">
        <div className="topbar">
          <div className="sk-line heading" />
          <div className="spacer" />
          <div className="sk-line pill" />
        </div>
        <div className="sk-grid">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="sk-col">
              <div className="sk-line day" />
              {i % 2 === 0 && <div className="sk-block chip" style={{ marginTop: `${12 + i * 9}%`, height: '9%' }} />}
              {i % 3 === 1 && <div className="sk-block chip" style={{ marginTop: `${28 + i * 6}%`, height: '13%' }} />}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
