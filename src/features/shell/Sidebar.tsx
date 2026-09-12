import { addMonths, endOfMonth, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, addDays, isToday, endOfWeek } from 'date-fns'
import { useMemo, useState } from 'react'
import { IconCalendar, IconKeyboard, IconMoon, IconNotes, IconPlus, IconSettings, IconSun, IconTasks, IconChevronLeft, IconChevronRight, IconSparkle } from '../../components/Icons'
import { Tooltip } from '../../components/Tooltip'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { expandEvents } from '../../lib/recurrence'
import { weekRange } from '../../lib/dates'
import { MOD } from '../../hooks/useHotkeys'
import { isMobileViewport } from '../../lib/media'

export function Sidebar() {
  const ui = useUi()
  const categories = useStore((s) => s.categories)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const isDark = document.documentElement.dataset.theme === 'dark'

  // On a phone the sidebar is an overlay drawer, so navigating should dismiss it.
  const go = (section: Parameters<typeof ui.setSection>[0]) => {
    ui.setSection(section)
    if (isMobileViewport()) ui.setSidebarOpen(false)
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <IconSparkle />
        </div>
        Notework
      </div>

      <button className={`nav-item ${ui.section === 'calendar' ? 'active' : ''}`} onClick={() => go('calendar')}>
        <IconCalendar /> Calendar <kbd>1</kbd>
      </button>
      <button className={`nav-item ${ui.section === 'notes' ? 'active' : ''}`} onClick={() => go('notes')}>
        <IconNotes /> Notes <kbd>2</kbd>
      </button>
      <button className={`nav-item ${ui.section === 'tasks' ? 'active' : ''}`} onClick={() => go('tasks')}>
        <IconTasks /> Tasks <kbd>3</kbd>
      </button>

      <MiniCalendar />

      <div className="sidebar-section" style={{ flex: 1, minHeight: 0 }}>
        <div className="sidebar-section-title">
          <span>Classes</span>
          <Tooltip content="Add a class or category">
            <button onClick={() => ui.setCategoriesOpen(true)} aria-label="Manage classes">
              <IconPlus />
            </button>
          </Tooltip>
        </div>
        <div className="sidebar-scroll">
          {categories.length === 0 && (
            <button className="cat-row" onClick={() => ui.setCategoriesOpen(true)} style={{ color: 'var(--text-3)' }}>
              <span className="dot" style={{ background: 'var(--border-strong)' }} />
              <span className="name">Add your first class…</span>
            </button>
          )}
          {categories.map((c) => {
            const hidden = ui.hiddenCategoryIds.has(c.id)
            return (
              <button
                key={c.id}
                className={`cat-row ${hidden ? 'hidden-cat' : ''}`}
                onClick={() => ui.toggleCategoryHidden(c.id)}
                onDoubleClick={() => ui.setCategoriesOpen(true)}
                title={hidden ? 'Show on calendar' : 'Hide from calendar'}
              >
                <span className="dot" style={{ background: c.color }} />
                <span className="name">{c.name}</span>
                {c.code && <span className="subtle" style={{ fontSize: 11 }}>{c.code}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="sidebar-footer">
        <Tooltip content={`Settings · ${MOD},`}>
          <button className="btn ghost icon" onClick={() => ui.setSettingsOpen(true)} aria-label="Settings">
            <IconSettings />
          </button>
        </Tooltip>
        <Tooltip content="Keyboard shortcuts · ?">
          <button className="btn ghost icon" onClick={() => ui.setShortcutsOpen(true)} aria-label="Keyboard shortcuts">
            <IconKeyboard />
          </button>
        </Tooltip>
        <Tooltip content={isDark ? 'Switch to light' : 'Switch to dark'}>
          <button
            className="btn ghost icon"
            onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
            aria-label="Toggle theme"
            style={{ marginLeft: 'auto' }}
          >
            {isDark ? <IconSun /> : <IconMoon />}
          </button>
        </Tooltip>
        <span className="sr-only">{settings.theme}</span>
      </div>
    </aside>
  )
}

function MiniCalendar() {
  const ui = useUi()
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn)
  const events = useStore((s) => s.events)
  const [month, setMonth] = useState(() => startOfMonth(ui.anchorDate))

  // Keep the mini calendar following the main view when it moves months.
  const anchorMonth = startOfMonth(ui.anchorDate).getTime()
  const [lastAnchor, setLastAnchor] = useState(anchorMonth)
  if (anchorMonth !== lastAnchor) {
    setLastAnchor(anchorMonth)
    setMonth(startOfMonth(ui.anchorDate))
  }

  const gridStart = startOfWeek(month, { weekStartsOn })
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn })
  const days = useMemo(() => {
    const out: Date[] = []
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) out.push(d)
    return out
  }, [gridStart.getTime(), gridEnd.getTime()])

  const busy = useMemo(() => {
    const set = new Set<string>()
    for (const o of expandEvents(events, gridStart, gridEnd)) set.add(format(o.start, 'yyyy-MM-dd'))
    return set
  }, [events, gridStart.getTime(), gridEnd.getTime()])

  const week = weekRange(ui.anchorDate, weekStartsOn)
  const dows = days.slice(0, 7).map((d) => format(d, 'EEEEE'))

  return (
    <div className="mini-cal">
      <div className="mini-cal-head">
        <span>{format(month, 'MMMM yyyy')}</span>
        <span style={{ display: 'flex', gap: 2 }}>
          <button onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
            <IconChevronLeft width={14} height={14} />
          </button>
          <button onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
            <IconChevronRight width={14} height={14} />
          </button>
        </span>
      </div>
      <div className="mini-cal-grid">
        {dows.map((d, i) => (
          <div key={i} className="dow">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const inWeek = ui.calendarView === 'week' && ui.section === 'calendar' && d >= week.start && d <= week.end
          return (
            <button
              key={d.toISOString()}
              className={`day ${isSameMonth(d, month) ? '' : 'outside'} ${isToday(d) ? 'today' : ''} ${isSameDay(d, ui.anchorDate) && ui.section === 'calendar' ? 'selected' : ''} ${inWeek ? 'in-week' : ''}`}
              onClick={() => {
                ui.setAnchorDate(d)
                if (ui.section !== 'calendar') ui.setSection('calendar')
                if (isMobileViewport()) ui.setSidebarOpen(false)
              }}
            >
              {format(d, 'd')}
              {busy.has(format(d, 'yyyy-MM-dd')) && <span className="has-events" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
