import { addDays, differenceInCalendarDays, endOfWeek, startOfDay } from 'date-fns'
import { expandEvents } from '../../lib/recurrence'
import type { CalendarEvent, Occurrence, Priority } from '../../types/models'

export type TaskGroupKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'nextWeek' | 'later' | 'done'

export interface TaskGroup {
  key: TaskGroupKey
  label: string
  tasks: Occurrence[]
}

const PRIORITY_RANK: Record<Priority | 'none', number> = { high: 0, medium: 1, low: 2, none: 3 }

export function priorityRank(p: Priority | undefined): number {
  return PRIORITY_RANK[p ?? 'none']
}

/** The moment a task is due: assignments use their end (the deadline), exams their start. */
export function dueDate(o: Occurrence): Date {
  return o.kind === 'assignment' ? (o.allDay ? new Date(o.end.getTime() - 1) : o.end) : o.start
}

/**
 * Turn assignments/exams into a flat task list covering overdue items and the
 * next `horizonDays`. Recurring tasks yield one entry per occurrence.
 */
export function deriveTasks(events: CalendarEvent[], now: Date, opts: { horizonDays?: number; pastDays?: number } = {}): Occurrence[] {
  const horizon = opts.horizonDays ?? 120
  const past = opts.pastDays ?? 60
  const taskEvents = events.filter((e) => e.kind === 'assignment' || e.kind === 'exam')
  const start = startOfDay(addDays(now, -past))
  const end = addDays(startOfDay(now), horizon)
  return expandEvents(taskEvents, start, end).sort((a, b) => dueDate(a).getTime() - dueDate(b).getTime())
}

export function groupTasks(tasks: Occurrence[], now: Date, weekStartsOn: 0 | 1): TaskGroup[] {
  const groups: Record<TaskGroupKey, Occurrence[]> = { overdue: [], today: [], tomorrow: [], week: [], nextWeek: [], later: [], done: [] }
  const today = startOfDay(now)
  const weekEnd = endOfWeek(now, { weekStartsOn })
  const nextWeekEnd = addDays(weekEnd, 7)
  for (const t of tasks) {
    if (t.completed) {
      groups.done.push(t)
      continue
    }
    const due = dueDate(t)
    const days = differenceInCalendarDays(startOfDay(due), today)
    const isPast = t.allDay ? days < 0 : due.getTime() < now.getTime()
    if (isPast) groups.overdue.push(t)
    else if (days === 0) groups.today.push(t)
    else if (days === 1) groups.tomorrow.push(t)
    else if (due <= weekEnd) groups.week.push(t)
    else if (due <= nextWeekEnd) groups.nextWeek.push(t)
    else groups.later.push(t)
  }
  // Within a group: priority first, then due time.
  for (const k of Object.keys(groups) as TaskGroupKey[]) {
    if (k === 'done') groups[k].sort((a, b) => dueDate(b).getTime() - dueDate(a).getTime())
    else groups[k].sort((a, b) => priorityRank(a.event.priority) - priorityRank(b.event.priority) || dueDate(a).getTime() - dueDate(b).getTime())
  }
  const labels: Record<TaskGroupKey, string> = {
    overdue: 'Overdue',
    today: 'Today',
    tomorrow: 'Tomorrow',
    week: 'This week',
    nextWeek: 'Next week',
    later: 'Later',
    done: 'Completed',
  }
  return (Object.keys(groups) as TaskGroupKey[]).map((key) => ({ key, label: labels[key], tasks: groups[key] })).filter((g) => g.tasks.length > 0)
}
