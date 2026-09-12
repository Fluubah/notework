import { useMemo, useState } from 'react'
import { IconCheck, IconChevronDown, IconClock, IconFlag, IconLink, IconPlus, IconSidebar, IconTasks } from '../../components/Icons'
import { Popover, anchorFromEvent, type Anchor } from '../../components/Popover'
import { toast } from '../../components/Toast'
import { Tooltip } from '../../components/Tooltip'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { MOD, useHotkeys } from '../../hooks/useHotkeys'
import { useNow } from '../../hooks/useNow'
import { UNCATEGORIZED_COLOR } from '../../lib/colors'
import { relativeDue, toISO } from '../../lib/dates'
import { parseQuickAdd } from '../../lib/quickAdd'
import type { Occurrence, Priority } from '../../types/models'
import { OccurrenceCard } from '../calendar/OccurrencePopover'
import { deleteOccurrenceOrSeries, kindVerb } from '../calendar/eventOps'
import { useSeriesScope } from '../calendar/SeriesScopeDialog'
import { deriveTasks, dueDate, groupTasks } from './tasks'

const PRIORITY_CYCLE: (Priority | undefined)[] = [undefined, 'high', 'medium', 'low']

export function TasksPage() {
  const ui = useUi()
  const events = useStore((s) => s.events)
  const categories = useStore((s) => s.categories)
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn)
  const { addEvent, toggleCompleted, updateEvent } = useStore()
  const now = useNow()
  const [text, setText] = useState('')
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [open, setOpen] = useState<{ occ: Occurrence; anchor: Anchor } | null>(null)
  const scope = useSeriesScope()

  const tasks = useMemo(() => {
    let t = deriveTasks(events, now)
    if (catFilter) t = t.filter((o) => o.categoryId === catFilter)
    return t
  }, [events, now, catFilter])
  const groups = useMemo(() => groupTasks(tasks, now, weekStartsOn), [tasks, now, weekStartsOn])
  const openCount = tasks.filter((t) => !t.completed).length

  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, { now, categories }) : null), [text, now, categories])

  const submit = () => {
    if (!parsed) return
    const kind = parsed.kind === 'exam' ? 'exam' : 'assignment'
    const start = parsed.start
    const end = kind === 'assignment' && !parsed.allDay ? parsed.start : parsed.end
    const ev = addEvent({
      title: parsed.title,
      kind,
      categoryId: parsed.categoryId ?? catFilter,
      start: toISO(start),
      end: toISO(end),
      allDay: parsed.allDay,
      recurrence: parsed.recurrence,
      priority: parsed.priority,
      location: parsed.location,
    })
    setText('')
    toast(`Added “${ev.title}”`, { actionLabel: 'Undo', onAction: () => useStore.getState().deleteEvent(ev.id) })
  }

  useHotkeys([{ combo: 'n', handler: () => document.getElementById('task-add-input')?.focus() }])

  const cyclePriority = (o: Occurrence) => {
    const i = PRIORITY_CYCLE.indexOf(o.event.priority)
    updateEvent(o.eventId, { priority: PRIORITY_CYCLE[(i + 1) % PRIORITY_CYCLE.length] })
  }

  return (
    <>
      <div className="topbar">
        {!ui.sidebarOpen && (
          <Tooltip content={`Show sidebar · ${MOD}\\`}>
            <button className="btn ghost icon" onClick={ui.toggleSidebar} aria-label="Show sidebar">
              <IconSidebar />
            </button>
          </Tooltip>
        )}
        <h1>Tasks</h1>
        <span className="muted" style={{ fontSize: 13 }}>
          {openCount === 0 ? 'Nothing due' : `${openCount} open`}
        </span>
        <span className="spacer" />
      </div>
      <div className="tasks-root">
        <div className="tasks-body">
          <form
            className="task-add"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <IconPlus />
            <input id="task-add-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task… “Lab report due Friday 5pm”, “Chem quiz next Tuesday !!”" aria-label="Add task" />
            {parsed && (
              <span className="preview">
                {parsed.title} · {relativeDue(parsed.kind === 'exam' ? parsed.start : parsed.allDay ? new Date(parsed.end.getTime() - 1) : parsed.start, parsed.allDay, now, '').short}
              </span>
            )}
            <button type="submit" className="btn sm primary" disabled={!parsed}>
              Add
            </button>
          </form>

          <div className="task-filters">
            <button className={`chip ${catFilter === null ? 'active' : ''}`} onClick={() => setCatFilter(null)}>
              All classes
            </button>
            {categories.map((c) => (
              <button key={c.id} className={`chip ${catFilter === c.id ? 'active' : ''}`} onClick={() => setCatFilter(catFilter === c.id ? null : c.id)}>
                <span className="dot" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
            <span className="spacer" />
            <label className="checkbox-row" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              <button type="button" role="switch" aria-checked={showDone} className="switch" onClick={() => setShowDone(!showDone)} />
              Show completed
            </label>
          </div>

          {groups.filter((g) => g.key !== 'done').length === 0 && (
            <div className="empty">
              <IconTasks />
              <h3>All clear</h3>
              <p>Assignments and exams from your calendar show up here. Add one above, or with {MOD}K anywhere.</p>
            </div>
          )}

          {groups.map((g) => {
            if (g.key === 'done' && !showDone) return null
            return (
              <section key={g.key} className="task-group">
                <div className={`task-group-head ${g.key}`}>
                  {g.label}
                  <span className="count">{g.tasks.length}</span>
                </div>
                <div className="task-list">
                  {g.tasks.map((o) => {
                    const cat = categories.find((c) => c.id === o.categoryId)
                    const due = relativeDue(dueDate(o), o.allDay, now, kindVerb(o.kind))
                    const links = o.event.linkedNoteIds.length + o.event.linkedPdfIds.length
                    const prio = o.event.priority
                    return (
                      <div key={o.id} className={`task-row ${o.completed ? 'done' : ''}`} data-occ-id={o.id}>
                        <button className={`task-check ${o.completed ? 'checked' : ''}`} onClick={() => toggleCompleted(o.eventId, o.isRecurring ? o.originalStart : null)} aria-label={o.completed ? 'Mark not done' : 'Mark done'}>
                          <IconCheck />
                        </button>
                        <div className="task-main">
                          <div className="task-title">
                            <span className="truncate">{o.title}</span>
                            {o.kind === 'exam' && <span className="kind exam">Exam</span>}
                          </div>
                          <div className="task-sub">
                            {cat ? (
                              <span className="cat">
                                <span className="dot" style={{ background: cat.color }} />
                                {cat.name}
                              </span>
                            ) : (
                              <span className="cat">
                                <span className="dot" style={{ background: UNCATEGORIZED_COLOR }} />
                                No class
                              </span>
                            )}
                            {links > 0 && (
                              <span className="links" title={`${links} attached`}>
                                <IconLink /> {links}
                              </span>
                            )}
                            {o.location && <span className="truncate">{o.location}</span>}
                          </div>
                        </div>
                        <div className="task-right">
                          <Tooltip content={prio ? `Priority: ${prio} (click to change)` : 'Set priority'}>
                            <button className={`prio-btn ${prio ?? ''} ${prio ? 'set' : ''}`} onClick={() => cyclePriority(o)} aria-label="Priority">
                              <IconFlag />
                            </button>
                          </Tooltip>
                          <Tooltip content={`${due.absolute} · click for details & attachments`}>
                            <button className={`task-due ${o.completed ? '' : due.tone}`} onClick={(e) => setOpen({ occ: o, anchor: anchorFromEvent(e) })}>
                              <IconClock />
                              {due.label}
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
          {groups.some((g) => g.key === 'done') && !showDone && (
            <button className="btn ghost sm task-done-toggle" onClick={() => setShowDone(true)}>
              <IconChevronDown /> Show {groups.find((g) => g.key === 'done')!.tasks.length} completed
            </button>
          )}
        </div>
      </div>

      <Popover anchor={open?.anchor ?? null} onClose={() => setOpen(null)} placement="auto">
        {open && (
          <OccurrenceCard
            occId={open.occ.id}
            onEdit={() => {
              ui.openEditor({ mode: 'edit', occurrence: open.occ })
              setOpen(null)
            }}
            onDelete={() => {
              const o = open.occ
              setOpen(null)
              scope.ask(o, 'Delete repeating task', (sc) => deleteOccurrenceOrSeries(o, sc), true)
            }}
            onClose={() => setOpen(null)}
          />
        )}
      </Popover>
      {scope.dialog}
    </>
  )
}
