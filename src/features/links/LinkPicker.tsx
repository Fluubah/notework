import { useMemo, useState } from 'react'
import { IconNotes, IconPdf, IconSearch } from '../../components/Icons'
import { Modal } from '../../components/Modal'
import { useStore } from '../../data/store'

/** Modal to attach notes/PDFs to an event. Phase 4 fleshes this out; it works now. */
export function LinkPicker({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const event = useStore((s) => s.events.find((e) => e.id === eventId))
  const notes = useStore((s) => s.notes)
  const pdfs = useStore((s) => s.pdfs)
  const categories = useStore((s) => s.categories)
  const updateEvent = useStore((s) => s.updateEvent)
  const [q, setQ] = useState('')

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? ''
    const all = [
      ...notes.map((n) => ({ id: n.id, type: 'note' as const, title: n.title || 'Untitled note', sub: catName(n.categoryId), categoryId: n.categoryId })),
      ...pdfs.map((p) => ({ id: p.id, type: 'pdf' as const, title: p.name, sub: catName(p.categoryId), categoryId: p.categoryId })),
    ]
    const filtered = needle ? all.filter((i) => i.title.toLowerCase().includes(needle) || i.sub.toLowerCase().includes(needle)) : all
    // Same-class items first
    return filtered.sort((a, b) => Number(b.categoryId === event?.categoryId) - Number(a.categoryId === event?.categoryId))
  }, [q, notes, pdfs, categories, event?.categoryId])

  if (!event) return null
  const isLinked = (i: { id: string; type: 'note' | 'pdf' }) => (i.type === 'note' ? event.linkedNoteIds : event.linkedPdfIds).includes(i.id)
  const toggle = (i: { id: string; type: 'note' | 'pdf' }) => {
    if (i.type === 'note') {
      const set = new Set(event.linkedNoteIds)
      if (set.has(i.id)) set.delete(i.id)
      else set.add(i.id)
      updateEvent(event.id, { linkedNoteIds: [...set] })
    } else {
      const set = new Set(event.linkedPdfIds)
      if (set.has(i.id)) set.delete(i.id)
      else set.add(i.id)
      updateEvent(event.id, { linkedPdfIds: [...set] })
    }
  }

  return (
    <Modal open onClose={onClose} title={`Attach to “${event.title}”`}>
      <div className="modal-body">
        <div style={{ position: 'relative' }}>
          <IconSearch style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-3)' }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Search notes and PDFs…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        {items.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>
            <p>No notes or PDFs yet. Create some in the Notes section first.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 360, overflow: 'auto' }}>
            {items.map((i) => (
              <button key={i.type + i.id} className="menu-item" onClick={() => toggle(i)}>
                <input type="checkbox" readOnly checked={isLinked(i)} tabIndex={-1} />
                {i.type === 'note' ? <IconNotes /> : <IconPdf />}
                <span className="truncate">{i.title}</span>
                {i.sub && <span className="hint">{i.sub}</span>}
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
