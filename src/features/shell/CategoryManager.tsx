import { useState } from 'react'
import { ColorPicker } from '../../components/ColorPicker'
import { IconEdit, IconTrash } from '../../components/Icons'
import { ConfirmDialog, Modal } from '../../components/Modal'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { suggestColor } from '../../lib/colors'
import type { Category } from '../../types/models'

interface FormState {
  id?: string
  name: string
  code: string
  color: string
}

export function CategoryManager() {
  const open = useUi((s) => s.categoriesOpen)
  const setOpen = useUi((s) => s.setCategoriesOpen)
  const categories = useStore((s) => s.categories)
  const { addCategory, updateCategory, deleteCategory } = useStore()
  const [form, setForm] = useState<FormState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null)

  const startNew = () => setForm({ name: '', code: '', color: suggestColor(categories.map((c) => c.color)) })
  const startEdit = (c: Category) => setForm({ id: c.id, name: c.name, code: c.code ?? '', color: c.color })

  const submit = () => {
    if (!form || !form.name.trim()) return
    if (form.id) updateCategory(form.id, { name: form.name.trim(), code: form.code.trim() || undefined, color: form.color })
    else addCategory({ name: form.name.trim(), code: form.code.trim() || undefined, color: form.color })
    setForm(null)
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setOpen(false)
        setForm(null)
      }}
      title="Classes & categories"
    >
      <div className="modal-body">
        <p className="muted" style={{ fontSize: 13 }}>
          Colour-code everything by class. Pick any colour you like — there are no presets.
        </p>
        {categories.length > 0 && (
          <div className="cat-list">
            {categories.map((c) => (
              <div key={c.id} className="cat-edit-row">
                <span className="swatch" style={{ background: c.color }} />
                <span className="name">{c.name}</span>
                {c.code && <span className="code">{c.code}</span>}
                <button className="btn ghost icon sm" onClick={() => startEdit(c)} aria-label={`Edit ${c.name}`}>
                  <IconEdit />
                </button>
                <button className="btn ghost icon sm danger" onClick={() => setConfirmDelete(c)} aria-label={`Delete ${c.name}`}>
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        )}
        {form ? (
          <form
            className="cat-edit-form"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="field-row">
              <div className="field" style={{ flex: 2 }}>
                <label>Name</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Organic Chemistry" autoFocus />
              </div>
              <div className="field">
                <label>Short code</label>
                <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CHEM 201" />
              </div>
            </div>
            <div className="field">
              <label>Colour</label>
              <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={!form.name.trim()}>
                {form.id ? 'Save' : 'Add class'}
              </button>
            </div>
          </form>
        ) : (
          <button className="btn" onClick={startNew} style={{ alignSelf: 'flex-start' }}>
            + New class or category
          </button>
        )}
      </div>
      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete "${confirmDelete?.name}"?`}
        message="Events and notes in this class will be kept, but become uncategorised."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) deleteCategory(confirmDelete.id)
          setConfirmDelete(null)
        }}
      />
    </Modal>
  )
}
