import { useMemo } from 'react'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { expandEvents } from '../../lib/recurrence'
import type { Occurrence } from '../../types/models'

/** Occurrences within a range, honouring the sidebar category filter and settings. */
export function useOccurrences(start: Date, end: Date, opts: { includeHidden?: boolean } = {}): Occurrence[] {
  const events = useStore((s) => s.events)
  const showCompleted = useStore((s) => s.settings.showCompleted)
  const hidden = useUi((s) => s.hiddenCategoryIds)
  const startMs = start.getTime()
  const endMs = end.getTime()
  const includeHidden = opts.includeHidden ?? false
  return useMemo(() => {
    let occ = expandEvents(events, new Date(startMs), new Date(endMs))
    if (!includeHidden && hidden.size > 0) occ = occ.filter((o) => !o.categoryId || !hidden.has(o.categoryId))
    if (!showCompleted) occ = occ.filter((o) => !o.completed)
    return occ
  }, [events, startMs, endMs, hidden, showCompleted, includeHidden])
}
