import { addDays, addMinutes, differenceInCalendarDays, endOfDay, isSameDay, isToday, isWeekend, max as maxDate, min as minDate, startOfDay, format } from 'date-fns'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { useNow } from '../../hooks/useNow'
import { formatCompactTime, minutesSinceMidnight, weekRange } from '../../lib/dates'
import { layoutColumns } from '../../lib/layout'
import type { Occurrence } from '../../types/models'
import { EventChip } from './EventChip'
import { applyTimeChange } from './eventOps'
import { useSeriesScope } from './SeriesScopeDialog'
import { useOccurrences } from './useOccurrences'

const SNAP = 15 // minutes
const HOUR_H = 52

type Drag =
  | { kind: 'create'; dayIdx: number; startMin: number; endMin: number; moved: boolean }
  | { kind: 'move'; occ: Occurrence; originDay: number; originMin: number; dayDelta: number; minDelta: number; moved: boolean; pointerId: number }
  | { kind: 'resize'; occ: Occurrence; originMin: number; endMin: number; moved: boolean; pointerId: number }

export function WeekView() {
  const anchor = useUi((s) => s.anchorDate)
  const openEditor = useUi((s) => s.openEditor)
  const selectOccurrence = useUi((s) => s.selectOccurrence)
  const setAnchor = useUi((s) => s.setAnchorDate)
  const setView = useUi((s) => s.setCalendarView)
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn)
  const dayStartHour = useStore((s) => s.settings.dayStartHour)
  const now = useNow(30_000)
  const { days, start, end } = useMemo(() => weekRange(anchor, weekStartsOn), [anchor, weekStartsOn])
  const occurrences = useOccurrences(startOfDay(start), endOfDay(end))
  const bodyRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [scrollbarW, setScrollbarW] = useState(0)
  const scope = useSeriesScope()

  // Scroll to the day start hour (or near "now" if today is in view) on mount / week change.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const todayInWeek = days.some((d) => isToday(d))
    const targetHour = todayInWeek ? Math.max(0, now.getHours() - 2) : dayStartHour
    el.scrollTo({ top: Math.max(0, targetHour * HOUR_H - 14), behavior: 'instant' as ScrollBehavior })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.getTime()])

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const measure = () => setScrollbarW(el.offsetWidth - el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Split all-day vs timed
  const { allDay, timedByDay } = useMemo(() => {
    const allDay: Occurrence[] = []
    const timedByDay: Occurrence[][] = days.map(() => [])
    for (const o of occurrences) {
      const spansDays = differenceInCalendarDays(new Date(o.end.getTime() - 1), o.start) >= 1
      if (o.allDay || spansDays) allDay.push(o)
      else {
        const idx = differenceInCalendarDays(o.start, start)
        if (idx >= 0 && idx < 7) timedByDay[idx].push(o)
      }
    }
    return { allDay, timedByDay }
  }, [occurrences, days, start])

  // All-day lane assignment
  const allDayLanes = useMemo(() => {
    const lanes: { occ: Occurrence; col: number; span: number; lane: number }[] = []
    const laneEnds: number[] = []
    for (const occ of allDay.slice().sort((a, b) => a.start.getTime() - b.start.getTime())) {
      const s = maxDate([startOfDay(occ.start), start])
      const e = minDate([new Date(occ.end.getTime() - 1), end])
      const col = differenceInCalendarDays(s, start)
      const span = Math.max(1, differenceInCalendarDays(e, s) + 1)
      let lane = laneEnds.findIndex((endCol) => endCol <= col)
      if (lane === -1) lane = laneEnds.length
      laneEnds[lane] = col + span
      lanes.push({ occ, col, span, lane })
    }
    return { lanes, count: laneEnds.length }
  }, [allDay, start, end])

  const minutesFromY = (clientY: number) => {
    const grid = gridRef.current
    if (!grid) return 0
    const rect = grid.getBoundingClientRect()
    const y = clientY - rect.top
    return Math.max(0, Math.min(24 * 60, Math.round(((y / HOUR_H) * 60) / SNAP) * SNAP))
  }
  const dayFromX = (clientX: number) => {
    const grid = gridRef.current
    if (!grid) return 0
    const rect = grid.getBoundingClientRect()
    const colW = (rect.width - 56) / 7
    return Math.max(0, Math.min(6, Math.floor((clientX - rect.left - 56) / colW)))
  }

  // ---- create by click/drag on empty space
  const onColPointerDown = (e: ReactPointerEvent<HTMLDivElement>, dayIdx: number) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('.cal-event')) return
    const m = minutesFromY(e.clientY)
    setDrag({ kind: 'create', dayIdx, startMin: m, endMin: m + 60, moved: false })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return
    if (drag.kind === 'create') {
      const m = minutesFromY(e.clientY)
      const moved = drag.moved || Math.abs(m - drag.startMin) >= SNAP
      setDrag({ ...drag, endMin: Math.max(drag.startMin + SNAP, m), moved })
    } else if (drag.kind === 'move') {
      const m = minutesFromY(e.clientY)
      const d = dayFromX(e.clientX)
      const minDelta = m - drag.originMin
      const dayDelta = d - drag.originDay
      const moved = drag.moved || minDelta !== 0 || dayDelta !== 0
      setDrag({ ...drag, minDelta, dayDelta, moved })
    } else if (drag.kind === 'resize') {
      const m = minutesFromY(e.clientY)
      const startMin = minutesSinceMidnight(drag.occ.start)
      setDrag({ ...drag, endMin: Math.max(startMin + SNAP, m), moved: true })
    }
  }

  const onPointerUp = () => {
    if (!drag) return
    const d = drag
    setDrag(null)
    if (d.kind === 'create') {
      const day = days[d.dayIdx]
      const s = addMinutes(startOfDay(day), d.startMin)
      const e = addMinutes(startOfDay(day), d.moved ? d.endMin : d.startMin + 60)
      openEditor({ mode: 'create', draft: { start: s, end: e, allDay: false } })
    } else if (d.kind === 'move') {
      // Pointer capture on the grid means the chip never receives a click, so
      // a press-and-release without movement is the "open details" gesture.
      if (!d.moved) {
        selectOccurrence(d.occ.id)
        return
      }
      const dur = d.occ.end.getTime() - d.occ.start.getTime()
      const newStart = addMinutes(addDays(d.occ.start, d.dayDelta), d.minDelta)
      const newEnd = new Date(newStart.getTime() + dur)
      scope.ask(d.occ, 'Move repeating event', (sc) => applyTimeChange(d.occ, newStart, newEnd, sc))
    } else if (d.kind === 'resize') {
      if (!d.moved) {
        selectOccurrence(d.occ.id)
        return
      }
      const newEnd = addMinutes(startOfDay(d.occ.start), d.endMin)
      scope.ask(d.occ, 'Resize repeating event', (sc) => applyTimeChange(d.occ, d.occ.start, newEnd, sc))
    }
  }

  const startMove = (e: ReactPointerEvent<HTMLDivElement>, occ: Occurrence, dayIdx: number) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).classList.contains('ev-resize')) {
      e.stopPropagation()
      setDrag({ kind: 'resize', occ, originMin: minutesFromY(e.clientY), endMin: minutesSinceMidnight(occ.end), moved: false, pointerId: e.pointerId })
      ;(e.currentTarget.closest('.week-grid') as HTMLElement)?.setPointerCapture(e.pointerId)
      return
    }
    e.stopPropagation()
    setDrag({ kind: 'move', occ, originDay: dayIdx, originMin: minutesFromY(e.clientY), dayDelta: 0, minDelta: 0, moved: false, pointerId: e.pointerId })
    ;(e.currentTarget.closest('.week-grid') as HTMLElement)?.setPointerCapture(e.pointerId)
  }

  const nowMin = minutesSinceMidnight(now)
  const todayIdx = days.findIndex((d) => isSameDay(d, now))

  return (
    <div className="week" style={{ ['--scrollbar-w' as string]: `${scrollbarW}px` }}>
      <div className="week-header">
        <div />
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className={`week-day-head ${isToday(d) ? 'today' : ''}`}
            onClick={() => {
              setAnchor(d)
              setView('month')
            }}
            title="Open month"
          >
            <span className="dow">{format(d, 'EEE')}</span>
            <span className="dom">{format(d, 'd')}</span>
          </div>
        ))}
      </div>

      <div className="week-allday" style={{ minHeight: 28 + Math.max(0, allDayLanes.count - 1) * 22 }}>
        <div className="gutter-label">all-day</div>
        {days.map((d, i) => (
          <div
            key={i}
            className="week-allday-cell"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('.cal-event')) return
              openEditor({ mode: 'create', draft: { start: startOfDay(d), end: addDays(startOfDay(d), 1), allDay: true } })
            }}
          >
            {allDayLanes.lanes
              .filter((l) => l.col === i)
              .map((l) => (
                <EventChip
                  key={l.occ.id}
                  occ={l.occ}
                  short
                  showTime={false}
                  style={{
                    position: 'absolute',
                    top: 3 + l.lane * 22,
                    left: 3,
                    width: `calc(${l.span * 100}% - 6px)`,
                    zIndex: 2,
                  }}
                />
              ))}
          </div>
        ))}
      </div>

      <div className="week-body" ref={bodyRef}>
        <div
          className="week-grid"
          ref={gridRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
          style={{ ['--hour-h' as string]: `${HOUR_H}px` }}
        >
          <div className="week-gutter">
            {Array.from({ length: 24 }, (_, h) =>
              h === 0 ? null : (
                <div key={h} className="hour-label" style={{ top: h * HOUR_H }}>
                  {h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}
                </div>
              ),
            )}
            {todayIdx >= 0 && (
              <div className="now-line-gutter" style={{ top: (nowMin / 60) * HOUR_H }}>
                {formatCompactTime(now)}
              </div>
            )}
          </div>
          {days.map((day, dayIdx) => {
            const items = timedByDay[dayIdx]
            const positioned = layoutColumns(items, (o) => ({ start: o.start.getTime(), end: Math.max(o.end.getTime(), o.start.getTime() + SNAP * 60_000) }))
            return (
              <div
                key={day.toISOString()}
                className={`week-col ${isToday(day) ? 'today' : ''} ${isWeekend(day) ? 'weekend' : ''}`}
                onPointerDown={(e) => onColPointerDown(e, dayIdx)}
              >
                {positioned.map(({ item: occ, col, span, cols }) => {
                  let s = minutesSinceMidnight(occ.start)
                  let e = Math.max(s + SNAP, minutesSinceMidnight(occ.end) || 24 * 60)
                  let dragging = false
                  let colOffset = 0
                  if (drag?.kind === 'move' && drag.occ.id === occ.id && drag.moved) {
                    s += drag.minDelta
                    e += drag.minDelta
                    dragging = true
                    colOffset = drag.dayDelta
                  }
                  if (drag?.kind === 'resize' && drag.occ.id === occ.id && drag.moved) {
                    e = drag.endMin
                    dragging = true
                  }
                  const short = e - s <= 30
                  const widthPct = (100 / cols) * span
                  const leftPct = (100 / cols) * col
                  return (
                    <EventChip
                      key={occ.id}
                      occ={occ}
                      short={short}
                      className={dragging ? 'dragging' : ''}
                      onPointerDown={(ev) => startMove(ev, occ, dayIdx)}
                      style={{
                        top: (s / 60) * HOUR_H,
                        height: Math.max(18, ((e - s) / 60) * HOUR_H - 2),
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 6px)`,
                        transform: colOffset ? `translateX(calc(${colOffset * 100}% + ${colOffset * 6}px))` : undefined,
                        zIndex: 2 + col,
                      }}
                    >
                      <div className="ev-resize" />
                    </EventChip>
                  )
                })}
                {drag?.kind === 'create' && drag.dayIdx === dayIdx && drag.moved && (
                  <div className="drag-ghost" style={{ top: (drag.startMin / 60) * HOUR_H, height: ((drag.endMin - drag.startMin) / 60) * HOUR_H }}>
                    {formatCompactTime(addMinutes(startOfDay(day), drag.startMin))} – {formatCompactTime(addMinutes(startOfDay(day), drag.endMin))}
                  </div>
                )}
                {isSameDay(day, now) && <div className="now-line" style={{ top: (nowMin / 60) * HOUR_H }} />}
              </div>
            )
          })}
        </div>
      </div>
      {scope.dialog}
    </div>
  )
}
