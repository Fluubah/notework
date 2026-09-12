import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { format, parseISO } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconBold,
  IconCheckSquare,
  IconCode,
  IconHighlighter,
  IconItalic,
  IconList,
  IconListOrdered,
  IconMore,
  IconPin,
  IconQuote,
  IconRedo,
  IconStrike,
  IconTrash,
  IconUnderline,
  IconUndo,
  IconLink,
} from '../../components/Icons'
import { ConfirmDialog } from '../../components/Modal'
import { Popover, anchorFromEvent, type Anchor } from '../../components/Popover'
import { Tooltip } from '../../components/Tooltip'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { UNCATEGORIZED_COLOR } from '../../lib/colors'
import { MOD } from '../../hooks/useHotkeys'
import type { Note } from '../../types/models'
import { excerptFromDoc } from './notesModel'

/**
 * Extensions are a module-level constant: TipTap compares options by reference
 * on every render and re-applies them (restoring the DOM selection into the
 * editor, which steals focus) whenever a new array is passed.
 */
const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Underline,
  Highlight,
  TaskList,
  TaskItem.configure({ nested: true }),
  Link.configure({ openOnClick: true, autolink: true }),
  Placeholder.configure({ placeholder: 'Start writing… Try "- " for a list, "# " for a heading, "[] " for a task.' }),
]

export function NoteEditor({ note }: { note: Note }) {
  const updateNote = useStore((s) => s.updateNote)
  const deleteNote = useStore((s) => s.deleteNote)
  const categories = useStore((s) => s.categories)
  const folders = useStore((s) => s.folders)
  const events = useStore((s) => s.events)
  const ui = useUi()
  const [title, setTitle] = useState(note.title)
  const [menu, setMenu] = useState<Anchor | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const saveTimer = useRef<number | null>(null)
  const persist = useRef<(editor: Editor) => void>(() => {})
  useEffect(() => {
    persist.current = (editor) => {
      const json = editor.getJSON()
      updateNote(note.id, { content: json, excerpt: excerptFromDoc(json) })
    }
  }, [note.id, updateNote])

  const editor = useEditor(
    {
      extensions: EXTENSIONS,
      content: (note.content as object | null) ?? '',
      onUpdate: onEditorUpdate,
    },
    [note.id],
  )
  function onEditorUpdate({ editor }: { editor: Editor }) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => persist.current(editor), 400)
  }

  // Flush pending edits on unmount.
  useEffect(
    () => () => {
      if (saveTimer.current && editor && !editor.isDestroyed) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
        persist.current(editor)
      }
    },
    [editor],
  )

  const commitTitle = (t: string) => {
    setTitle(t)
    updateNote(note.id, { title: t })
  }

  const category = categories.find((c) => c.id === note.categoryId)
  const catFolders = folders.filter((f) => f.categoryId === note.categoryId)
  const linkedEvents = useMemo(() => events.filter((e) => e.linkedNoteIds.includes(note.id)), [events, note.id])

  return (
    <div className="note-pane">
      <div className="note-toolbar">
        {editor && <Toolbar editor={editor} />}
        <span className="spacer" />
        <div className="note-meta">
          <div className="cat-select-wrap">
            <span className="dot" style={{ background: category?.color ?? UNCATEGORIZED_COLOR }} />
            <select className="select" value={note.categoryId ?? ''} onChange={(e) => updateNote(note.id, { categoryId: e.target.value || null, folderId: null })} aria-label="Class">
              <option value="">No class</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {catFolders.length > 0 && (
            <select className="select" style={{ paddingLeft: 10 }} value={note.folderId ?? ''} onChange={(e) => updateNote(note.id, { folderId: e.target.value || null })} aria-label="Folder">
              <option value="">No folder</option>
              {catFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <button className="tb-btn" onClick={(e) => setMenu(anchorFromEvent(e))} aria-label="Note options">
            <IconMore />
          </button>
        </div>
      </div>
      <div className="note-scroll">
        <div className="note-body">
          <input
            className="note-title"
            placeholder="Untitled note"
            value={title}
            onChange={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.currentTarget.selectionStart === title.length)) {
                e.preventDefault()
                editor?.commands.focus('start')
              }
            }}
            autoFocus={!note.title && !note.content}
          />
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="note-footer-meta">
        <span>Edited {format(parseISO(note.updatedAt), 'MMM d, h:mm a')}</span>
        {linkedEvents.length > 0 && (
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <IconLink width={12} height={12} />
            {linkedEvents.map((e) => (
              <button
                key={e.id}
                className="chip"
                style={{ height: 20 }}
                onClick={() => {
                  ui.setAnchorDate(parseISO(e.start))
                  ui.setSection('calendar')
                  ui.selectOccurrence(e.recurrence ? `${e.id}@${e.start}` : e.id)
                }}
              >
                {e.title}
              </button>
            ))}
          </span>
        )}
      </div>

      <Popover anchor={menu} onClose={() => setMenu(null)} placement="bottom-end">
        <button
          className="menu-item"
          onClick={() => {
            updateNote(note.id, { pinned: !note.pinned })
            setMenu(null)
          }}
        >
          <IconPin /> {note.pinned ? 'Unpin' : 'Pin to top'}
        </button>
        <div className="menu-sep" />
        <button
          className="menu-item danger"
          onClick={() => {
            setMenu(null)
            setConfirmDelete(true)
          }}
        >
          <IconTrash /> Delete note
        </button>
      </Popover>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this note?"
        message="This can’t be undone."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          ui.selectNote(null)
          deleteNote(note.id)
        }}
      />
    </div>
  )
}

function B({ active, onClick, label, children, shortcut }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode; shortcut?: string }) {
  return (
    <Tooltip content={shortcut ? `${label} · ${shortcut}` : label}>
      <button
        className={`tb-btn ${active ? 'active' : ''}`}
        onMouseDown={(e) => {
          e.preventDefault()
          onClick()
        }}
        aria-label={label}
        aria-pressed={active}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  // Re-render on selection changes so active states stay accurate.
  const [, force] = useState(0)
  useEffect(() => {
    const rerender = () => force((n) => n + 1)
    editor.on('transaction', rerender)
    return () => {
      editor.off('transaction', rerender)
    }
  }, [editor])

  // Build chains lazily: `chain().focus()` at render time would steal focus.
  const c = () => editor.chain().focus()
  return (
    <>
      <B label="Undo" shortcut={`${MOD}Z`} onClick={() => c().undo().run()}>
        <IconUndo />
      </B>
      <B label="Redo" shortcut={`${MOD}⇧Z`} onClick={() => c().redo().run()}>
        <IconRedo />
      </B>
      <span className="sep" />
      {([1, 2, 3] as const).map((l) => (
        <Tooltip key={l} content={`Heading ${l}`}>
          <button
            className={`tb-btn text ${editor.isActive('heading', { level: l }) ? 'active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              editor.chain().focus().toggleHeading({ level: l }).run()
            }}
          >
            H{l}
          </button>
        </Tooltip>
      ))}
      <span className="sep" />
      <B label="Bold" shortcut={`${MOD}B`} active={editor.isActive('bold')} onClick={() => c().toggleBold().run()}>
        <IconBold />
      </B>
      <B label="Italic" shortcut={`${MOD}I`} active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}>
        <IconItalic />
      </B>
      <B label="Underline" shortcut={`${MOD}U`} active={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}>
        <IconUnderline />
      </B>
      <B label="Strikethrough" active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}>
        <IconStrike />
      </B>
      <B label="Highlight" shortcut={`${MOD}⇧H`} active={editor.isActive('highlight')} onClick={() => c().toggleHighlight().run()}>
        <IconHighlighter />
      </B>
      <B label="Inline code" active={editor.isActive('code')} onClick={() => c().toggleCode().run()}>
        <IconCode />
      </B>
      <span className="sep" />
      <B label="Bullet list" active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>
        <IconList />
      </B>
      <B label="Numbered list" active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>
        <IconListOrdered />
      </B>
      <B label="Task list" active={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()}>
        <IconCheckSquare />
      </B>
      <B label="Quote" active={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}>
        <IconQuote />
      </B>
    </>
  )
}
