import { addDays, differenceInMilliseconds, format, parse, parseISO, startOfDay } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { IconRepeat, IconTrash } from '../../components/Icons'
import { Modal } from '../../components/Modal'
import { toast } from '../../components/Toast'
import { useStore } from '../../data/store'
import { useUi, type EditorState } from '../../data/uiStore'
import { UNCATEGORIZED_COLOR } from '../../lib/colors'
import { toISO } from '../../lib/dates'
import type { CalendarEvent, EventKind, Priority, RecurrenceRule, Weekday } from '../../types/models'
import { deleteOccurrenceOrSeries, KIND_LABEL, shiftSeries, type SeriesScope } from './eventOps'
import { useSeriesScope } from './SeriesScopeDialog'

interface Form {
  title: string
  kind: EventKind
  categoryId: string | null
  allDay: boolean
  startDate: string // yyyy-MM-dd
  startTime: string // HH:mm
  endDate: string
  endTime: string
  location: string
  description: string
  repeat: 'none' | 'daily' | 'weekly'
  interval: number
  byWeekday: Weekday[]
  until: string
  priority: Priority | ''
}

const WEEKDAYS: { d: Weekday; label: string }[] = [
  { d: 1, label: 'M' },
  { d: 2, label: 'T' },
  { d: 3, label: 'W' },
  { d: 4, label: 'T' },
  { d: 5, label: 'F' },
  { d: 6, label: 'S' },
  { d: 0, label: 'S' },
]

const fmtDate = (d: Date) => format(d, 'yyyy-MM-dd')
const fmtTime = (d: Date) => format(d, 'HH:mm')
const parseDT = (date: string, time: string) => parse(`${date} ${time || '00:00'}`, 'yyyy-MM-dd HH:mm', new Date())

function initialForm(state: EditorState, lastCategoryId: string | null): Form {
  if (state.mode === 'edit' && state.occurrence) {
    const o = state.occurrence
    const ev = o.event
    const endForForm = o.allDay ? addDays(o.end, -1) : o.end
    return {
      title: o.title,
      kind: o.kind,
      categoryId: o.categoryId,
      allDay: o.allDay,
      startDate: fmtDate(o.start),
      startTime: fmtTime(o.start),
      endDate: fmtDate(endForForm),
      endTime: fmtTime(endForForm),
      location: o.location ?? '',
      description: o.description ?? '',
      repeat: ev.recurrence?.freq ?? 'none',
      interval: ev.recurrence?.interval ?? 1,
      byWeekday: ev.recurrence?.byWeekday ?? [o.start.getDay() as Weekday],
      until: ev.recurrence?.until ? fmtDate(parseISO(ev.recurrence.until)) : '',
      priority: ev.priority ?? '',
    }
  }
  const d = state.draft!
  const endForForm = d.allDay ? addDays(d.end, -1) : d.end
  return {
    title: d.title ?? '',
    kind: d.kind ?? 'event',
    categoryId: d.categoryId ?? lastCategoryId,
    allDay: d.allDay,
    startDate: fmtDate(d.start),
    startTime: fmtTime(d.start),
    endDate: fmtDate(endForForm),
    endTime: fmtTime(endForForm),
    location: d.location ?? '',
    description: '',
    repeat: d.recurrence?.freq ?? (d.kind === 'class' ? 'weekly' : 'none'),
    interval: d.recurrence?.interval ?? 1,
    byWeekday: d.recurrence?.byWeekday ?? [d.start.getDay() as Weekday],
    until: d.recurrence?.until ? fmtDate(parseISO(d.recurrence.until)) : '',
    priority: d.priority ?? '',
  }
}

export function EventEditor() {
  const editor = useUi((s) => s.editor)
  const close = useUi((s) => s.closeEditor)
  if (!editor) return null
  return <EventEditorInner key={editor.occurrence?.id ?? 'new'} state={editor} onClose={close} />
}

function EventEditorInner({ state, onClose }: { state: EditorState; onClose: () => void }) {
  const categories = useStore((s) => s.categories)
  const events = useStore((s) => s.events)
  const { addEvent, updateEvent, updateSeries, updateOccurrence } = useStore()
  const setCategoriesOpen = useUi((s) => s.setCategoriesOpen)
  const lastCategoryId = useMemo(() => {
    const last = [...events].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    return last?.categoryId ?? categories[0]?.id ?? null
  }, [])
  const [form, setForm] = useState<Form>(() => initialForm(state, lastCategoryId))
  const occ = state.occurrence
  const isRecurringEdit = state.mode === 'edit' && !!occ?.isRecurring
  const [scope, setScope] = useState<SeriesScope>(isRecurringEdit ? 'occurrence' : 'series')
  const scopeDialog = useSeriesScope()
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const isAssignment = form.kind === 'assignment'

  // Keep end >= start as the user edits the start.
  const startD = parseDT(form.startDate, form.startTime)
  const endD = parseDT(form.endDate, form.endTime)
  useEffect(() => {
    if (isAssignment) return
    if (endD < startD) {
      const dur = state.occurrence ? differenceInMilliseconds(state.occurrence.end, state.occurrence.start) : 60 * 60_000
      const e = new Date(startD.getTime() + (form.allDay ? 0 : dur))
      setForm((f) => ({ ...f, endDate: fmtDate(e), endTime: fmtTime(e) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.startDate, form.startTime])

  const valid = form.title.trim().length > 0 && !Number.isNaN(startD.getTime())

  const computeTimes = () => {
    let start = form.allDay ? startOfDay(startD) : startD
    let end: Date
    if (isAssignment) end = form.allDay ? addDays(start, 1) : start
    else if (form.allDay) end = addDays(startOfDay(endD), 1)
    else end = endD > start ? endD : new Date(start.getTime() + 60 * 60_000)
    if (form.allDay && isAssignment) end = addDays(start, 1)
    return { start, end }
  }

  const buildRecurrence = (): RecurrenceRule | undefined => {
    if (form.repeat === 'none') return undefined
    const rule: RecurrenceRule = { freq: form.repeat, interval: Math.max(1, form.interval || 1) }
    if (form.repeat === 'weekly') rule.byWeekday = form.byWeekday.length ? form.byWeekday : [startD.getDay() as Weekday]
    if (form.until) rule.until = toISO(startOfDay(parseDT(form.until, '00:00')))
    return rule
  }

  const save = () => {
    if (!valid) return
    const { start, end } = computeTimes()
    const common = {
      title: form.title.trim(),
      kind: form.kind,
      categoryId: form.categoryId,
      allDay: form.allDay,
      location: form.location.trim() || undefined,
      description: form.description.trim() || undefined,
      priority: form.priority || undefined,
    }

    if (state.mode === 'create') {
      addEvent({ ...common, start: toISO(start), end: toISO(end), recurrence: buildRecurrence() })
      toast(form.repeat === 'none' ? 'Event added' : 'Repeating event added')
      onClose()
      return
    }

    const o = occ!
    if (!o.isRecurring) {
      updateEvent(o.eventId, { ...common, start: toISO(start), end: toISO(end), recurrence: buildRecurrence() })
      onClose()
      return
    }
    if (scope === 'occurrence') {
      updateOccurrence(o.eventId, o.originalStart, {
        title: common.title,
        start: toISO(start),
        end: toISO(end),
        location: common.location ?? '',
        description: common.description ?? '',
        categoryId: common.categoryId,
      })
      onClose()
      return
    }
    // Whole series: shift by the delta from this occurrence, apply the new duration and fields.
    const delta = start.getTime() - o.start.getTime()
    const shifted = shiftSeries(o.event, delta)
    const seriesStart = parseISO(shifted.start!)
    const patch: Partial<CalendarEvent> = {
      ...common,
      start: shifted.start,
      end: toISO(new Date(seriesStart.getTime() + (end.getTime() - start.getTime()))),
      recurrence: buildRecurrence(),
    }
    // If the user changed the weekday rule explicitly, prefer it over the shifted one.
    if (patch.recurrence && shifted.recurrence && form.repeat === 'weekly' && form.byWeekday.length) patch.recurrence = { ...patch.recurrence, byWeekday: form.byWeekday }
    updateSeries(o.eventId, patch)
    onClose()
  }

  const remove = () => {
    if (!occ) return
    scopeDialog.ask(
      occ,
      'Delete repeating event',
      (sc) => {
        deleteOccurrenceOrSeries(occ, sc)
        onClose()
      },
      true,
    )
  }

  const catColor = categories.find((c) => c.id === form.categoryId)?.color ?? UNCATEGORIZED_COLOR

  return (
    <Modal
      open
      onClose={onClose}
      title={state.mode === 'create' ? 'New event' : 'Edit event'}
      footer={
        <>
          {state.mode === 'edit' && (
            <button className="btn ghost danger" onClick={remove}>
              <IconTrash /> Delete
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!valid} title="⌘↵">
            {state.mode === 'create' ? 'Add' : 'Save'}
          </button>
        </>
      }
    >
      <div
        className="modal-body"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            save()
          }
        }}
      >
        <input className="input title-input" placeholder="Add a title" value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus />

        <div className="kind-picker" role="radiogroup" aria-label="Type">
          {(Object.keys(KIND_LABEL) as EventKind[]).map((k) => (
            <button key={k} className={form.kind === k ? 'active' : ''} onClick={() => set('kind', k)} role="radio" aria-checked={form.kind === k}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {isRecurringEdit && (
          <div className="editor-scope">
            <IconRepeat />
            <span>This event repeats</span>
            <div className="segmented">
              <button className={scope === 'occurrence' ? 'active' : ''} onClick={() => setScope('occurrence')}>
                Only this one
              </button>
              <button className={scope === 'series' ? 'active' : ''} onClick={() => setScope('series')}>
                All events
              </button>
            </div>
          </div>
        )}

        <div className="field">
          <label>Class</label>
          <div className="cat-select">
            <div className="cat-select-wrap">
              <span className="dot" style={{ background: catColor }} />
              <select className="select" value={form.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || null)}>
                <option value="">No class</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.code ? ` (${c.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="button" onClick={() => setCategoriesOpen(true)}>
              Manage
            </button>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>{isAssignment ? 'Due date' : 'Starts'}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" className="input" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
              {!form.allDay && <input type="time" className="input" style={{ width: 118, flex: 'none' }} value={form.startTime} onChange={(e) => set('startTime', e.target.value)} step={300} />}
            </div>
          </div>
          {!isAssignment && (
            <div className="field">
              <label>Ends</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="date" className="input" value={form.endDate} min={form.startDate} onChange={(e) => set('endDate', e.target.value)} />
                {!form.allDay && <input type="time" className="input" style={{ width: 118, flex: 'none' }} value={form.endTime} onChange={(e) => set('endTime', e.target.value)} step={300} />}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <label className="checkbox-row">
            <button role="switch" aria-checked={form.allDay} className="switch" type="button" onClick={() => set('allDay', !form.allDay)} />
            All day
          </label>
        </div>

        <div className="field">
          <label>Repeat</label>
          <div className="field-row" style={{ alignItems: 'center' }}>
            <select className="select" value={form.repeat} disabled={scope === 'occurrence' && isRecurringEdit} onChange={(e) => set('repeat', e.target.value as Form['repeat'])} style={{ flex: 'none', width: 150 }}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            {form.repeat !== 'none' && (
              <>
                <span className="muted" style={{ flex: 'none' }}>
                  every
                </span>
                <input type="number" className="input" min={1} max={52} value={form.interval} onChange={(e) => set('interval', Number(e.target.value))} style={{ width: 60, flex: 'none' }} disabled={scope === 'occurrence' && isRecurringEdit} />
                <span className="muted" style={{ flex: 'none' }}>
                  {form.repeat === 'daily' ? (form.interval === 1 ? 'day' : 'days') : form.interval === 1 ? 'week' : 'weeks'}
                </span>
              </>
            )}
          </div>
          {form.repeat === 'weekly' && (
            <div className="weekday-picker" style={{ marginTop: 6 }}>
              {WEEKDAYS.map(({ d, label }) => (
                <button
                  key={d}
                  type="button"
                  className={form.byWeekday.includes(d) ? 'active' : ''}
                  disabled={scope === 'occurrence' && isRecurringEdit}
                  onClick={() => set('byWeekday', form.byWeekday.includes(d) ? form.byWeekday.filter((x) => x !== d) : [...form.byWeekday, d])}
                  aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {form.repeat !== 'none' && (
            <div className="field-row" style={{ marginTop: 6, alignItems: 'center' }}>
              <span className="muted" style={{ flex: 'none' }}>
                until
              </span>
              <input type="date" className="input" value={form.until} min={form.startDate} onChange={(e) => set('until', e.target.value)} style={{ width: 170, flex: 'none' }} disabled={scope === 'occurrence' && isRecurringEdit} />
              {form.until && (
                <button type="button" className="btn ghost sm" onClick={() => set('until', '')}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {(form.kind === 'assignment' || form.kind === 'exam') && (
          <div className="field">
            <label>Priority</label>
            <div className="priority-picker">
              {(['', 'low', 'medium', 'high'] as const).map((p) => (
                <button key={p} type="button" className={`${p} ${form.priority === p ? 'active' : ''}`} onClick={() => set('priority', p)}>
                  {p === '' ? 'None' : p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label>Location</label>
          <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Room 204, Zoom, …" />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Anything to remember" />
        </div>
      </div>
      {scopeDialog.dialog}
    </Modal>
  )
}
