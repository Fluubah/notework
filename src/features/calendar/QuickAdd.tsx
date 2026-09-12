import { format } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { IconSparkle } from '../../components/Icons'
import { toast } from '../../components/toastStore'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { UNCATEGORIZED_COLOR } from '../../lib/colors'
import { formatCompactTime, toISO } from '../../lib/dates'
import { parseQuickAdd } from '../../lib/quickAdd'
import { describeRecurrence } from '../../lib/recurrence'
import { Modal } from '../../components/Modal'
import { MOD } from '../../hooks/useHotkeys'
import { KIND_LABEL } from './eventOps'

const EXAMPLES = ['Physics HW due Friday 11pm', 'Chem lecture every Mon/Wed 10am', 'Study group tomorrow 3-4:30pm', 'History midterm Oct 3 2pm @ Room 101']

/**
 * ⌘K palette: type a sentence, get an event. Shows a live preview of what was
 * understood so the user can trust it before pressing Enter.
 */
export function QuickAdd() {
  const open = useUi((s) => s.quickAddOpen)
  const setOpen = useUi((s) => s.setQuickAddOpen)
  if (!open) return null
  return <QuickAddInner onClose={() => setOpen(false)} />
}

function QuickAddInner({ onClose }: { onClose: () => void }) {
  const categories = useStore((s) => s.categories)
  const addEvent = useStore((s) => s.addEvent)
  const openEditor = useUi((s) => s.openEditor)
  const setAnchorDate = useUi((s) => s.setAnchorDate)
  const setSection = useUi((s) => s.setSection)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const parsed = useMemo(() => parseQuickAdd(text, { categories }), [text, categories])
  const category = parsed?.categoryId ? categories.find((c) => c.id === parsed.categoryId) : undefined

  const submit = (viaEditor: boolean) => {
    if (!parsed) return
    if (viaEditor) {
      openEditor({
        mode: 'create',
        draft: {
          start: parsed.start,
          end: parsed.end,
          allDay: parsed.allDay,
          title: parsed.title,
          kind: parsed.kind,
          categoryId: parsed.categoryId,
          recurrence: parsed.recurrence,
          priority: parsed.priority,
          location: parsed.location,
        },
      })
      onClose()
      return
    }
    const ev = addEvent({
      title: parsed.title,
      kind: parsed.kind,
      categoryId: parsed.categoryId,
      start: toISO(parsed.start),
      end: toISO(parsed.end),
      allDay: parsed.allDay,
      recurrence: parsed.recurrence,
      priority: parsed.priority,
      location: parsed.location,
    })
    setAnchorDate(parsed.start)
    setSection('calendar')
    toast(`Added “${ev.title}”`, {
      actionLabel: 'Undo',
      onAction: () => useStore.getState().deleteEvent(ev.id),
    })
    onClose()
  }

  const when = parsed
    ? parsed.allDay
      ? format(parsed.start, 'EEE, MMM d')
      : parsed.kind === 'assignment' && parsed.end.getTime() === parsed.start.getTime()
        ? `${format(parsed.start, 'EEE, MMM d')} at ${formatCompactTime(parsed.start)}`
        : `${format(parsed.start, 'EEE, MMM d')} · ${formatCompactTime(parsed.start)} – ${formatCompactTime(parsed.end)}`
    : ''

  return (
    <Modal open onClose={onClose} className="quick-add">
      <div className="quick-add-input">
        <IconSparkle />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Try “Physics HW due Friday 11pm”"
          aria-label="Quick add"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit(e.shiftKey || e.metaKey || e.ctrlKey)
            }
          }}
        />
      </div>
      <div className="quick-add-preview">
        {parsed ? (
          <>
            <div className="parsed">
              <span className="parsed-chip">
                <span className="k">{KIND_LABEL[parsed.kind]}</span>
                <strong>{parsed.title}</strong>
              </span>
              <span className={`parsed-chip ${parsed.dateGuessed ? 'warn' : ''}`}>
                <span className="k">{parsed.dateGuessed ? 'No date · today' : 'When'}</span>
                {when}
              </span>
              {category && (
                <span className="parsed-chip">
                  <span className="dot" style={{ background: category.color ?? UNCATEGORIZED_COLOR }} />
                  {category.name}
                </span>
              )}
              {parsed.recurrence && (
                <span className="parsed-chip">
                  <span className="k">Repeats</span>
                  {describeRecurrence(parsed.recurrence)}
                </span>
              )}
              {parsed.location && (
                <span className="parsed-chip">
                  <span className="k">Where</span>
                  {parsed.location}
                </span>
              )}
              {parsed.priority && (
                <span className="parsed-chip">
                  <span className="k">Priority</span>
                  {parsed.priority}
                </span>
              )}
            </div>
            <div className="quick-add-hint">
              <kbd>↵</kbd> add · <kbd>⇧</kbd>
              <kbd>↵</kbd> open in editor · <kbd>Esc</kbd> cancel
            </div>
          </>
        ) : (
          <>
            <div className="quick-add-hint">Describe it in plain words. Dates, times, classes, repeats and priority are picked up automatically.</div>
            <div className="quick-add-examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} className="chip" onClick={() => setText(ex)}>
                  {ex}
                </button>
              ))}
            </div>
            <div className="quick-add-hint">
              Open any time with <kbd>{MOD}</kbd>
              <kbd>K</kbd>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
