import { addDays, format, startOfDay } from 'date-fns'
import { useMemo, useState } from 'react'
import { IconSearch } from '../../components/Icons'
import { Modal } from '../../components/Modal'
import { useStore } from '../../data/store'
import { useNow } from '../../hooks/useNow'
import { expandEvents } from '../../lib/recurrence'
import { KIND_LABEL } from '../calendar/eventOps'

/** Attach a note or PDF to calendar events (the reverse of LinkPicker). */
export function EventPicker({ item, onClose }: { item: { type: 'note' | 'pdf'; id: string; title: string }; onClose: () => void }) {
  const events = useStore((s) => s.events)
  const categories = useStore((s) => s.categories)
  const updateEvent = useStore((s) => s.updateEvent)
  const now = useNow(60_000)
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    // One row per event (not per occurrence): links live on the event.
    const seen = new Set<string>()
    const occ = expandEvents(events, startOfDay(addDays(now, -30)), addDays(now, 180))
    const out: { id: string; title: string; when: string; kind: string; catName: string; catColor?: string }[] = []
    for (const o of occ) {
      if (seen.has(o.eventId)) continue
      seen.add(o.eventId)
      const cat = categories.find((c) => c.id === o.categoryId)
      out.push({ id: o.eventId, title: o.title, when: format(o.start, 'EEE, MMM d'), kind: KIND_LABEL[o.kind], catName: cat?.name ?? '', catColor: cat?.color })
    }
    // Events without any occurrence in range (e.g. far future) still deserve a row.
    for (const e of events) {
      if (!seen.has(e.id)) {
        const cat = categories.find((c) => c.id === e.categoryId)
        out.push({ id: e.id, title: e.title, when: format(new Date(e.start), 'MMM d, yyyy'), kind: KIND_LABEL[e.kind], catName: cat?.name ?? '', catColor: cat?.color })
      }
    }
    return needle ? out.filter((r) => r.title.toLowerCase().includes(needle) || r.catName.toLowerCase().includes(needle)) : out
  }, [events, categories, q, now])

  const isLinked = (eventId: string) => {
    const e = events.find((x) => x.id === eventId)
    if (!e) return false
    return item.type === 'note' ? e.linkedNoteIds.includes(item.id) : e.linkedPdfIds.includes(item.id)
  }
  const toggle = (eventId: string) => {
    const e = events.find((x) => x.id === eventId)
    if (!e) return
    const key = item.type === 'note' ? 'linkedNoteIds' : 'linkedPdfIds'
    const set = new Set(e[key])
    if (set.has(item.id)) set.delete(item.id)
    else set.add(item.id)
    updateEvent(e.id, { [key]: [...set] })
  }

  return (
    <Modal open onClose={onClose} title={`Attach “${item.title}” to…`}>
      <div className="modal-body">
        <div style={{ position: 'relative' }}>
          <IconSearch style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-3)' }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Search assignments, exams, classes…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        {rows.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>
            <p>No events found.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 380, overflow: 'auto' }}>
            {rows.map((r) => (
              <button key={r.id} className="menu-item" onClick={() => toggle(r.id)} style={{ height: 'auto', padding: '6px 10px' }}>
                <input type="checkbox" readOnly checked={isLinked(r.id)} tabIndex={-1} />
                <span className="dot" style={{ background: r.catColor ?? 'var(--border-strong)' }} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="truncate">{r.title}</span>
                  <span className="subtle" style={{ fontSize: 11.5 }}>
                    {r.kind} · {r.when}
                    {r.catName ? ` · ${r.catName}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <span className="spacer" />
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}
