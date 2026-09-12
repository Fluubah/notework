import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from 'react'
import { useUi } from '../../data/uiStore'
import { formatCompactTime } from '../../lib/dates'
import { useCategoryColor } from './useCategoryColor'
import type { Occurrence } from '../../types/models'

interface Props {
  occ: Occurrence
  style?: CSSProperties
  className?: string
  /** Compact single-line rendering. */
  short?: boolean
  showTime?: boolean
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void
  children?: ReactNode
}

export function EventChip({ occ, style, className = '', short, showTime = true, onPointerDown, children }: Props) {
  const color = useCategoryColor(occ.categoryId)
  const selected = useUi((s) => s.selectedOccurrenceId === occ.id)
  const select = useUi((s) => s.selectOccurrence)

  const onClick = (e: MouseEvent) => {
    e.stopPropagation()
    select(occ.id)
  }

  const timeLabel = occ.allDay ? '' : formatCompactTime(occ.start)
  return (
    <div
      className={`cal-event kind-${occ.kind} ${short ? 'short' : ''} ${occ.completed ? 'done' : ''} ${selected ? 'selected' : ''} ${className}`}
      style={{ ...style, ['--ev' as string]: color }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      data-occ-id={occ.id}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          select(occ.id)
        }
      }}
      title={occ.title}
    >
      {short && showTime && timeLabel && <span className="ev-meta">{timeLabel}</span>}
      <span className="ev-title">{occ.title || 'Untitled'}</span>
      {!short && showTime && timeLabel && (
        <span className="ev-meta">
          {timeLabel} – {formatCompactTime(occ.end)}
          {occ.location ? ` · ${occ.location}` : ''}
        </span>
      )}
      {children}
    </div>
  )
}
