import { format, isSameDay } from 'date-fns'
import { useMemo, useState } from 'react'
import { IconCheck, IconClock, IconEdit, IconLink, IconNotes, IconPdf, IconRepeat, IconTrash, IconClose } from '../../components/Icons'
import { Popover, type Anchor } from '../../components/Popover'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { useNow } from '../../hooks/useNow'
import { formatTimeRange, relativeDue, formatShortDate } from '../../lib/dates'
import { describeRecurrence, findOccurrence } from '../../lib/recurrence'
import { useCategoryColor } from './useCategoryColor'
import { deleteOccurrenceOrSeries, kindVerb, KIND_LABEL } from './eventOps'
import { useSeriesScope } from './SeriesScopeDialog'
import { LinkPicker } from '../links/LinkPicker'

/** Screen position of an event chip, or a sensible fallback if it scrolled out. */
function measureOccurrence(occId: string): Anchor {
  const el = document.querySelector<HTMLElement>(`[data-occ-id="${CSS.escape(occId)}"]`)
  if (!el) return { x: window.innerWidth / 2 - 160, y: 120 }
  const rect = el.getBoundingClientRect()
  return { x: rect.right, y: rect.top, rect }
}

/** Detail card shown when an event chip is clicked. */
export function OccurrencePopover() {
  const selectedId = useUi((s) => s.selectedOccurrenceId)
  const select = useUi((s) => s.selectOccurrence)
  const openEditor = useUi((s) => s.openEditor)
  const events = useStore((s) => s.events)
  const occ = useMemo(() => (selectedId ? findOccurrence(events, selectedId) : null), [events, selectedId])
  const scope = useSeriesScope()

  // The popover anchors to the chip that was clicked, which is already on
  // screen from a previous commit. Measuring while rendering the selection
  // change keeps the popover and its anchor in the same paint, instead of
  // committing a mispositioned popover and correcting it from an effect.
  const [anchorState, setAnchorState] = useState<{ forId: string | null; anchor: Anchor | null }>({ forId: null, anchor: null })
  if (anchorState.forId !== selectedId) {
    setAnchorState({ forId: selectedId, anchor: selectedId ? measureOccurrence(selectedId) : null })
  }
  const anchor = anchorState.anchor

  // Keep the tree shape stable so the scope dialog never remounts mid-click.
  return (
    <>
      <Popover anchor={occ ? anchor : null} onClose={() => select(null)} placement="auto">
        {occ && (
          <OccurrenceCard
            occId={occ.id}
            onEdit={() => openEditor({ mode: 'edit', occurrence: occ })}
            onDelete={() =>
              scope.ask(
                occ,
                'Delete repeating event',
                (sc) => {
                  deleteOccurrenceOrSeries(occ, sc)
                  select(null)
                },
                true,
              )
            }
            onClose={() => select(null)}
          />
        )}
      </Popover>
      {scope.dialog}
    </>
  )
}

export function OccurrenceCard({ occId, onEdit, onDelete, onClose }: { occId: string; onEdit: () => void; onDelete: () => void; onClose?: () => void }) {
  const events = useStore((s) => s.events)
  const occ = useMemo(() => findOccurrence(events, occId), [events, occId])
  const category = useStore((s) => (occ?.categoryId ? s.categories.find((c) => c.id === occ.categoryId) : undefined))
  const color = useCategoryColor(occ?.categoryId ?? null)
  const toggleCompleted = useStore((s) => s.toggleCompleted)
  const now = useNow()
  const [linking, setLinking] = useState(false)
  if (!occ) return null

  const isTask = occ.kind === 'assignment' || occ.kind === 'exam'
  const due = relativeDue(occ.kind === 'assignment' ? occ.end : occ.start, occ.allDay, now, kindVerb(occ.kind))
  const when = occ.allDay
    ? isSameDay(occ.start, new Date(occ.end.getTime() - 1))
      ? format(occ.start, 'EEEE, MMMM d')
      : `${formatShortDate(occ.start)} – ${formatShortDate(new Date(occ.end.getTime() - 1))}`
    : occ.kind === 'assignment'
      ? format(occ.start, 'EEEE, MMMM d · h:mm a')
      : `${format(occ.start, 'EEEE, MMMM d')} · ${formatTimeRange(occ.start, occ.end)}`

  return (
    <div className="occ-pop">
      <div className="occ-pop-head">
        <span className="bar" style={{ background: color }} />
        <div style={{ minWidth: 0 }}>
          <h3 style={{ textDecoration: occ.completed ? 'line-through' : undefined, opacity: occ.completed ? 0.6 : 1 }}>{occ.title || 'Untitled'}</h3>
          <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
            {KIND_LABEL[occ.kind]}
            {category ? ` · ${category.name}` : ''}
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost icon sm" onClick={onEdit} aria-label="Edit" title="Edit">
            <IconEdit />
          </button>
          <button className="btn ghost icon sm danger" onClick={onDelete} aria-label="Delete" title="Delete">
            <IconTrash />
          </button>
          {onClose && (
            <button className="btn ghost icon sm" onClick={onClose} aria-label="Close">
              <IconClose />
            </button>
          )}
        </div>
      </div>
      <div className="occ-pop-meta">
        <div className="row">
          <IconClock />
          <span>{when}</span>
        </div>
        {occ.isRecurring && (
          <div className="row">
            <IconRepeat />
            <span>
              {describeRecurrence(occ.event.recurrence)}
              {occ.isOverridden ? ' · edited' : ''}
            </span>
          </div>
        )}
        {occ.location && (
          <div className="row">
            <span style={{ width: 14 }} />
            <span>{occ.location}</span>
          </div>
        )}
        {(isTask || (due.tone !== 'past' && due.tone !== 'later')) && (
          <div className="row">
            <span style={{ width: 14 }} />
            <span className={`due-badge ${occ.completed ? 'done' : due.tone}`} title={due.absolute}>
              {occ.completed ? 'Done' : due.label}
            </span>
          </div>
        )}
      </div>
      {occ.description && <div className="desc">{occ.description}</div>}
      <LinkedItems occId={occ.id} linking={linking} setLinking={setLinking} />
      <div className="occ-pop-foot">
        {isTask && (
          <button className={`btn sm ${occ.completed ? '' : 'primary'}`} onClick={() => toggleCompleted(occ.eventId, occ.isRecurring ? occ.originalStart : null)}>
            <IconCheck /> {occ.completed ? 'Mark not done' : 'Mark done'}
          </button>
        )}
        <button className="btn sm ghost" onClick={() => setLinking(true)}>
          <IconLink /> Attach note or PDF
        </button>
      </div>
    </div>
  )
}

function LinkedItems({ occId, linking, setLinking }: { occId: string; linking: boolean; setLinking: (v: boolean) => void }) {
  const events = useStore((s) => s.events)
  const occ = useMemo(() => findOccurrence(events, occId), [events, occId])
  const notes = useStore((s) => s.notes)
  const pdfs = useStore((s) => s.pdfs)
  const updateEvent = useStore((s) => s.updateEvent)
  const ui = useUi()
  if (!occ) return null
  const ev = occ.event
  const linkedNotes = ev.linkedNoteIds.map((id) => notes.find((n) => n.id === id)).filter(Boolean)
  const linkedPdfs = ev.linkedPdfIds.map((id) => pdfs.find((p) => p.id === id)).filter(Boolean)
  const openNote = (id: string) => {
    ui.selectNote(id)
    ui.setSection('notes')
    ui.selectOccurrence(null)
  }
  const openPdf = (id: string) => {
    ui.selectPdf(id)
    ui.setSection('notes')
    ui.selectOccurrence(null)
  }
  return (
    <>
      {(linkedNotes.length > 0 || linkedPdfs.length > 0) && (
        <div className="occ-pop-links">
          {linkedNotes.map((n) => (
            <button key={n!.id} className="link-row" onClick={() => openNote(n!.id)}>
              <IconNotes />
              <span className="truncate">{n!.title || 'Untitled note'}</span>
              <span
                className="x"
                role="button"
                aria-label="Unlink"
                onClick={(e) => {
                  e.stopPropagation()
                  updateEvent(ev.id, { linkedNoteIds: ev.linkedNoteIds.filter((x) => x !== n!.id) })
                }}
              >
                <IconClose width={12} height={12} />
              </span>
            </button>
          ))}
          {linkedPdfs.map((p) => (
            <button key={p!.id} className="link-row" onClick={() => openPdf(p!.id)}>
              <IconPdf />
              <span className="truncate">{p!.name}</span>
              <span
                className="x"
                role="button"
                aria-label="Unlink"
                onClick={(e) => {
                  e.stopPropagation()
                  updateEvent(ev.id, { linkedPdfIds: ev.linkedPdfIds.filter((x) => x !== p!.id) })
                }}
              >
                <IconClose width={12} height={12} />
              </span>
            </button>
          ))}
        </div>
      )}
      {linking && <LinkPicker eventId={ev.id} onClose={() => setLinking(false)} />}
    </>
  )
}
