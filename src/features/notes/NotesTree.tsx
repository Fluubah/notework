import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { IconChevronDown, IconEdit, IconFolder, IconFolderPlus, IconMore, IconPdf, IconPin, IconPlus, IconTrash } from '../../components/Icons'
import { ConfirmDialog } from '../../components/Modal'
import { Popover, anchorFromEvent, type Anchor } from '../../components/Popover'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { UNCATEGORIZED_COLOR } from '../../lib/colors'
import type { Category, Folder } from '../../types/models'
import { FolderDialog } from './FolderDialog'
import { itemId, itemTitle, type NotebookItem } from './notesModel'

interface Props {
  query: string
  onNewFolder: (categoryId: string | null) => void
}

interface GroupMenu {
  anchor: Anchor
  categoryId: string | null
  folder?: Folder
}

export function NotesTree({ query, onNewFolder }: Props) {
  const categories = useStore((s) => s.categories)
  const folders = useStore((s) => s.folders)
  const notes = useStore((s) => s.notes)
  const pdfs = useStore((s) => s.pdfs)
  const addNote = useStore((s) => s.addNote)
  const deleteFolder = useStore((s) => s.deleteFolder)
  const ui = useUi()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<GroupMenu | null>(null)
  const [renaming, setRenaming] = useState<Folder | null>(null)
  const [deleting, setDeleting] = useState<Folder | null>(null)

  const items: NotebookItem[] = useMemo(() => {
    const all: NotebookItem[] = [...notes.map((n) => ({ type: 'note' as const, item: n })), ...pdfs.map((p) => ({ type: 'pdf' as const, item: p }))]
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? all.filter((i) => itemTitle(i).toLowerCase().includes(needle) || (i.type === 'note' && i.item.excerpt.toLowerCase().includes(needle)))
      : all
    return filtered.sort((a, b) => {
      const pa = a.type === 'note' && a.item.pinned ? 1 : 0
      const pb = b.type === 'note' && b.item.pinned ? 1 : 0
      if (pa !== pb) return pb - pa
      return b.item.updatedAt.localeCompare(a.item.updatedAt)
    })
  }, [notes, pdfs, query])

  const toggle = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })

  const groups: { key: string; category: Category | null }[] = [...categories.map((c) => ({ key: c.id, category: c })), { key: 'none', category: null }]

  const renderItem = (i: NotebookItem) => {
    const active = i.type === 'note' ? ui.selectedNoteId === i.item.id : ui.selectedPdfId === i.item.id
    const updated = formatDistanceToNowStrict(parseISO(i.item.updatedAt), { addSuffix: true })
    return (
      <button
        key={itemId(i)}
        className={`note-item ${active ? 'active' : ''}`}
        onClick={() => (i.type === 'note' ? ui.selectNote(i.item.id) : ui.selectPdf(i.item.id))}
      >
        <span className="title">
          {i.type === 'pdf' ? <IconPdf /> : i.item.pinned ? <IconPin /> : null}
          <span className="truncate">{itemTitle(i)}</span>
        </span>
        {i.type === 'note' && i.item.excerpt && <span className="excerpt">{i.item.excerpt}</span>}
        <span className="meta">
          {i.type === 'pdf' ? `${i.item.pageCount} pages · ` : ''}
          {updated}
        </span>
      </button>
    )
  }

  return (
    <div className="notes-tree">
      {groups.map(({ key, category }) => {
        const catId = category?.id ?? null
        const groupFolders = folders.filter((f) => f.categoryId === catId)
        const loose = items.filter((i) => i.item.categoryId === catId && !i.item.folderId)
        const total = items.filter((i) => i.item.categoryId === catId).length
        if (!category && total === 0 && groupFolders.length === 0) return null
        const isCollapsed = collapsed.has(key) && !query
        return (
          <div key={key} className="tree-group">
            <div
              className={`tree-group-head ${isCollapsed ? 'collapsed' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => toggle(key)}
              onKeyDown={(e) => e.key === 'Enter' && toggle(key)}
            >
              <IconChevronDown className="caret" />
              <span className="dot" style={{ background: category?.color ?? UNCATEGORIZED_COLOR }} />
              <span className="name">{category?.name ?? 'Unfiled'}</span>
              <span className="count">{total}</span>
              <span
                className="more"
                role="button"
                aria-label="Options"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenu({ anchor: anchorFromEvent(e), categoryId: catId })
                }}
              >
                <IconMore width={14} height={14} />
              </span>
            </div>
            {!isCollapsed && (
              <>
                {groupFolders.map((f) => {
                  const fItems = items.filter((i) => i.item.folderId === f.id)
                  const fKey = `f:${f.id}`
                  const fCollapsed = collapsed.has(fKey) && !query
                  return (
                    <div key={f.id} className="tree-folder">
                      <div
                        className={`tree-group-head ${fCollapsed ? 'collapsed' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggle(fKey)}
                        onKeyDown={(e) => e.key === 'Enter' && toggle(fKey)}
                      >
                        <IconChevronDown className="caret" />
                        <IconFolder className="folder-icon" />
                        <span className="name">{f.name}</span>
                        <span className="count">{fItems.length}</span>
                        <span
                          className="more"
                          role="button"
                          aria-label="Folder options"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenu({ anchor: anchorFromEvent(e), categoryId: catId, folder: f })
                          }}
                        >
                          <IconMore width={14} height={14} />
                        </span>
                      </div>
                      {!fCollapsed && fItems.map(renderItem)}
                    </div>
                  )
                })}
                {loose.map(renderItem)}
              </>
            )}
          </div>
        )
      })}
      {items.length === 0 && query && (
        <div className="empty" style={{ padding: 24 }}>
          <p>No notes match “{query}”.</p>
        </div>
      )}

      <Popover anchor={menu?.anchor ?? null} onClose={() => setMenu(null)} placement="bottom-start">
        {menu && (
          <>
            <button
              className="menu-item"
              onClick={() => {
                const n = addNote({ categoryId: menu.categoryId, folderId: menu.folder?.id ?? null })
                ui.selectNote(n.id)
                setMenu(null)
              }}
            >
              <IconPlus /> New note here
            </button>
            {!menu.folder && (
              <button
                className="menu-item"
                onClick={() => {
                  onNewFolder(menu.categoryId)
                  setMenu(null)
                }}
              >
                <IconFolderPlus /> New folder
              </button>
            )}
            {menu.folder && (
              <>
                <div className="menu-sep" />
                <button
                  className="menu-item"
                  onClick={() => {
                    setRenaming(menu.folder!)
                    setMenu(null)
                  }}
                >
                  <IconEdit /> Rename folder
                </button>
                <button
                  className="menu-item danger"
                  onClick={() => {
                    setDeleting(menu.folder!)
                    setMenu(null)
                  }}
                >
                  <IconTrash /> Delete folder
                </button>
              </>
            )}
            {menu.categoryId && !menu.folder && (
              <>
                <div className="menu-sep" />
                <button
                  className="menu-item"
                  onClick={() => {
                    ui.setCategoriesOpen(true)
                    setMenu(null)
                  }}
                >
                  <IconEdit /> Edit class
                </button>
              </>
            )}
          </>
        )}
      </Popover>
      {renaming && <FolderDialog categoryId={renaming.categoryId} folder={renaming} onClose={() => setRenaming(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete folder “${deleting?.name}”?`}
        message="Notes inside will be kept and moved out of the folder."
        confirmLabel="Delete folder"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteFolder(deleting.id)
          setDeleting(null)
        }}
      />
    </div>
  )
}
