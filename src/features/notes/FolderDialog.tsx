import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { useStore } from '../../data/store'
import type { Folder } from '../../types/models'

export function FolderDialog({ categoryId, folder, onClose }: { categoryId: string | null; folder?: Folder; onClose: () => void }) {
  const categories = useStore((s) => s.categories)
  const addFolder = useStore((s) => s.addFolder)
  const updateFolder = useStore((s) => s.updateFolder)
  const [name, setName] = useState(folder?.name ?? '')
  const [cat, setCat] = useState<string | null>(folder ? folder.categoryId : categoryId)

  const submit = () => {
    if (!name.trim()) return
    if (folder) updateFolder(folder.id, { name: name.trim(), categoryId: cat })
    else addFolder({ name: name.trim(), categoryId: cat })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={folder ? 'Rename folder' : 'New folder'}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={!name.trim()}>
            {folder ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="field">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lecture notes" autoFocus />
        </div>
        <div className="field">
          <label>Inside</label>
          <select className="select" value={cat ?? ''} onChange={(e) => setCat(e.target.value || null)}>
            <option value="">No class (top level)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </form>
    </Modal>
  )
}
