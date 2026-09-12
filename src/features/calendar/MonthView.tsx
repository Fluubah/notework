import { addDays, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek, differenceInCalendarDays } from 'date-fns'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { dayKey } from '../../lib/dates'
import type { Occurrence } from '../../types/models'
import { EventChip } from './EventChip'
import { useOccurrences } from './useOccurrences'

const ROW_H = 20
const ROW_GAP = 2

export function MonthView() {
  const anchor = useUi((s) => s.anchorDate)
  const openEditor = useUi((s) => s.openEditor)
  const setAnchor = useUi((s) => s.setAnchorDate)
  const setView = useUi((s) => s.setCalendarView)
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn)

  // Memoised so the grid bounds keep a stable identity across renders; the
  // memos below depend on them directly.
  const monthStart = useMemo(() => startOfMonth(anchor), [anchor])
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn }), [monthStart, weekStartsOn])
  const gridEnd = useMemo(() => endOfWeek(endOfMonth(monthStart), { weekStartsOn }), [monthStart, weekStartsOn])
  const days = useMemo(() => {
    const out: Date[] = []
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) out.push(d)
    return out
  }, [gridStart, gridEnd])
  const weeks = days.length / 7

  const occurrences = useOccurrences(gridStart, new Date(gridEnd.getTime() + 86_400_000 - 1))

  // Group by day. Multi-day events appear on each day they cover.
  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>()
    for (const o of occurrences) {
      const last = new Date(o.end.getTime() - 1)
      const span = Math.max(0, differenceInCalendarDays(last, o.start))
      for (let i = 0; i <= span; i++) {
        const k = dayKey(addDays(o.start, i))
        ;(map.get(k) ?? map.set(k, []).get(k)!).push(o)
      }
    }
    for (const list of map.values()) list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime())
    return map
  }, [occurrences])

  // Measure how many chips fit in a cell.
  const gridRef = useRef<HTMLDivElement>(null)
  const [maxRows, setMaxRows] = useState(3)
  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const measure = () => {
      const cellH = el.clientHeight / weeks
      const avail = cellH - 34 // date number + padding
      setMaxRows(Math.max(1, Math.floor(avail / (ROW_H + ROW_GAP))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [weeks])

  const dows = days.slice(0, 7).map((d) => format(d, 'EEE'))

  return (
    <div className="month">
      <div className="month-header">
        {dows.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="month-grid" ref={gridRef}>
        {days.map((day) => {
          const list = byDay.get(dayKey(day)) ?? []
          const overflow = list.length > maxRows ? list.length - (maxRows - 1) : 0
          const shown = overflow ? list.slice(0, maxRows - 1) : list
          return (
            <div
              key={day.toISOString()}
              className={`month-cell ${isSameMonth(day, monthStart) ? '' : 'outside'} ${isToday(day) ? 'today' : ''}`}
              onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest('.cal-event')) return
                openEditor({ mode: 'create', draft: { start: startOfDay(day), end: addDays(startOfDay(day), 1), allDay: true } })
              }}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('.cal-event, .month-dom, .month-more')) return
                setAnchor(day)
              }}
            >
              <button
                className="month-dom"
                onClick={() => {
                  setAnchor(day)
                  setView('week')
                }}
                title="Open week"
              >
                {format(day, 'd')}
              </button>
              {shown.map((o) => (
                <EventChip key={o.id} occ={o} short className={o.allDay ? '' : 'timed'} />
              ))}
              {overflow > 0 && (
                <button
                  className="month-more"
                  onClick={() => {
                    setAnchor(day)
                    setView('week')
                  }}
                >
                  +{overflow} more
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
