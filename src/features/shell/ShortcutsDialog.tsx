import { Modal } from '../../components/Modal'
import { useUi } from '../../data/uiStore'
import { MOD } from '../../hooks/useHotkeys'

const groups: { title: string; items: [string, string[]][] }[] = [
  {
    title: 'Navigate',
    items: [
      ['Calendar', ['1']],
      ['Notes', ['2']],
      ['Tasks', ['3']],
      ['Toggle sidebar', [MOD, '\\']],
      ['Settings', [MOD, ',']],
    ],
  },
  {
    title: 'Calendar',
    items: [
      ['Week view', ['W']],
      ['Month view', ['M']],
      ['Today', ['T']],
      ['Previous / next', ['←', '→']],
      ['New event', ['N']],
      ['Quick add (natural language)', [MOD, 'K']],
    ],
  },
  {
    title: 'Editing',
    items: [
      ['Save', [MOD, '↵']],
      ['Close', ['Esc']],
      ['Bold / italic', [MOD, 'B / I']],
    ],
  },
]

export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen)
  const setOpen = useUi((s) => s.setShortcutsOpen)
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts">
      <div className="modal-body">
        <div className="shortcut-grid">
          {groups.map((g) => (
            <>
              <div key={g.title} className="shortcut-group">
                {g.title}
              </div>
              {g.items.map(([label, keys]) => (
                <div key={label} className="shortcut-row">
                  <span>{label}</span>
                  <span className="keys">
                    {keys.map((k, i) => (
                      <kbd key={i}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </>
          ))}
        </div>
      </div>
    </Modal>
  )
}
