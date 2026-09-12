import { lazy, Suspense, useMemo, useState } from 'react'
import { IconFolderPlus, IconPlus, IconSearch, IconSidebar } from '../../components/Icons'
import { Tooltip } from '../../components/Tooltip'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { MOD } from '../../hooks/useHotkeys'
import { NoteEditor } from './NoteEditor'
import { NotesTree } from './NotesTree'
const PdfViewerPane = lazy(() => import('../pdf/PdfViewerPane').then((m) => ({ default: m.PdfViewerPane })))
import { FolderDialog } from './FolderDialog'
import { importPdfFiles, PdfUploadButton } from '../pdf/PdfUploadButton'
import { IconNotes } from '../../components/Icons'

export function NotesPage() {
  const ui = useUi()
  const addNote = useStore((s) => s.addNote)
  const notes = useStore((s) => s.notes)
  const pdfs = useStore((s) => s.pdfs)
  const [query, setQuery] = useState('')
  const [folderDialog, setFolderDialog] = useState<{ categoryId: string | null } | null>(null)
  const [dragging, setDragging] = useState(false)

  const selectedNote = useMemo(() => notes.find((n) => n.id === ui.selectedNoteId) ?? null, [notes, ui.selectedNoteId])
  const selectedPdf = useMemo(() => pdfs.find((p) => p.id === ui.selectedPdfId) ?? null, [pdfs, ui.selectedPdfId])

  const createNote = () => {
    const f = ui.notesFilter
    const n = addNote({ categoryId: f?.categoryId ?? null, folderId: f?.folderId ?? null })
    ui.selectNote(n.id)
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
        <h1>Notes</h1>
        <span className="spacer" />
        <PdfUploadButton />
        <Tooltip content="New note">
          <button className="btn primary" onClick={createNote}>
            <IconPlus /> New note
          </button>
        </Tooltip>
      </div>
      <div
        className="notes-root"
        style={{ position: 'relative' }}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.items).some((i) => i.type === 'application/pdf')) {
            e.preventDefault()
            setDragging(true)
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={async (e) => {
          e.preventDefault()
          setDragging(false)
          const files = Array.from(e.dataTransfer.files).filter((f) => f.type === 'application/pdf')
          if (files.length) await importPdfFiles(files)
        }}
      >
        {dragging && <div className="pdf-drop">Drop PDFs to add them</div>}
        <div className="notes-list">
          <div className="notes-list-head">
            <div className="search">
              <IconSearch />
              <input className="input" placeholder="Search notes…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Tooltip content="New folder">
              <button className="btn ghost icon" onClick={() => setFolderDialog({ categoryId: ui.notesFilter?.categoryId ?? null })} aria-label="New folder">
                <IconFolderPlus />
              </button>
            </Tooltip>
          </div>
          <NotesTree query={query} onNewFolder={(categoryId) => setFolderDialog({ categoryId })} />
        </div>
        {selectedNote ? (
          <NoteEditor key={selectedNote.id} note={selectedNote} />
        ) : selectedPdf ? (
          <Suspense fallback={<div className="pdf-pane" />}>
            <PdfViewerPane key={selectedPdf.id} pdf={selectedPdf} />
          </Suspense>
        ) : (
          <div className="note-empty-pane">
            <div className="empty">
              <IconNotes />
              <h3>{notes.length === 0 && pdfs.length === 0 ? 'Your notebook is empty' : 'Pick a note'}</h3>
              <p>
                {notes.length === 0 && pdfs.length === 0
                  ? 'Create a note or upload a PDF. Organise them by class and folder from the list on the left.'
                  : 'Select something from the list, or start a fresh note.'}
              </p>
              <button className="btn primary" onClick={createNote} style={{ marginTop: 8 }}>
                <IconPlus /> New note
              </button>
            </div>
          </div>
        )}
      </div>
      {folderDialog && <FolderDialog categoryId={folderDialog.categoryId} onClose={() => setFolderDialog(null)} />}
    </>
  )
}
