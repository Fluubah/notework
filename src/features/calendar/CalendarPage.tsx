import { addMonths, addWeeks, format } from 'date-fns'
import { useMemo } from 'react'
import { IconChevronLeft, IconChevronRight, IconPlus, IconSidebar, IconSparkle } from '../../components/Icons'
import { Tooltip } from '../../components/Tooltip'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { MOD, useHotkeys } from '../../hooks/useHotkeys'
import { formatRangeTitle, roundToMinutes, weekRange } from '../../lib/dates'
import { MonthView } from './MonthView'
import { OccurrencePopover } from './OccurrencePopover'
import { WeekView } from './WeekView'

export function CalendarPage() {
  const ui = useUi()
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn)
  const { anchorDate: anchor, calendarView: view } = ui

  const title = useMemo(() => {
    if (view === 'month') return format(anchor, 'MMMM yyyy')
    const { start, end } = weekRange(anchor, weekStartsOn)
    return formatRangeTitle(start, end)
  }, [anchor, view, weekStartsOn])

  const go = (dir: -1 | 1) => ui.setAnchorDate(view === 'month' ? addMonths(anchor, dir) : addWeeks(anchor, dir))
  const today = () => ui.setAnchorDate(new Date())
  const newEvent = () => {
    const start = roundToMinutes(new Date(), 30)
    ui.openEditor({ mode: 'create', draft: { start, end: new Date(start.getTime() + 60 * 60_000), allDay: false } })
  }

  useHotkeys(
    [
      { combo: 'w', handler: () => ui.setCalendarView('week') },
      { combo: 'm', handler: () => ui.setCalendarView('month') },
      { combo: 't', handler: today },
      { combo: 'ArrowLeft', handler: () => go(-1) },
      { combo: 'ArrowRight', handler: () => go(1) },
      { combo: 'n', handler: newEvent },
    ],
    [anchor.getTime(), view],
  )

  return (
    <div className="calendar-root">
      <div className="topbar">
        {!ui.sidebarOpen && (
          <Tooltip content={`Show sidebar · ${MOD}\\`}>
            <button className="btn ghost icon" onClick={ui.toggleSidebar} aria-label="Show sidebar">
              <IconSidebar />
            </button>
          </Tooltip>
        )}
        <div className="topbar-group">
          <Tooltip content="Previous · ←">
            <button className="btn ghost icon" onClick={() => go(-1)} aria-label="Previous">
              <IconChevronLeft />
            </button>
          </Tooltip>
          <Tooltip content="Next · →">
            <button className="btn ghost icon" onClick={() => go(1)} aria-label="Next">
              <IconChevronRight />
            </button>
          </Tooltip>
          <Tooltip content="Jump to today · T">
            <button className="btn sm" onClick={today}>
              Today
            </button>
          </Tooltip>
        </div>
        <h1>{title}</h1>
        <span className="spacer" />
        <div className="segmented">
          <button className={view === 'week' ? 'active' : ''} onClick={() => ui.setCalendarView('week')}>
            Week
          </button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => ui.setCalendarView('month')}>
            Month
          </button>
        </div>
        <Tooltip content={`Quick add · ${MOD}K`}>
          <button className="btn icon" onClick={() => ui.setQuickAddOpen(true)} aria-label="Quick add">
            <IconSparkle />
          </button>
        </Tooltip>
        <Tooltip content="New event · N">
          <button className="btn primary" onClick={newEvent}>
            <IconPlus /> New
          </button>
        </Tooltip>
      </div>
      <div className="content">{view === 'week' ? <WeekView /> : <MonthView />}</div>
      <OccurrencePopover />
    </div>
  )
}
