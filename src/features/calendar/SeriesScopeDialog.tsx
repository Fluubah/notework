import { useCallback, useState, type ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import type { Occurrence } from '../../types/models'
import type { SeriesScope } from './eventOps'

interface Pending {
  occ: Occurrence
  title: string
  apply: (scope: SeriesScope) => void
  danger?: boolean
}

/**
 * Asks "just this one, or the whole series?" for recurring events. For
 * non-recurring events it applies immediately with scope 'series'.
 */
export function useSeriesScope() {
  const [pending, setPending] = useState<Pending | null>(null)

  const ask = useCallback((occ: Occurrence, title: string, apply: (scope: SeriesScope) => void, danger?: boolean) => {
    if (!occ.isRecurring) {
      apply('series')
      return
    }
    setPending({ occ, title, apply, danger })
  }, [])

  const dialog: ReactNode = (
    <Modal open={!!pending} onClose={() => setPending(null)} title={pending?.title}>
      <div className="modal-body">
        <p className="muted">
          <strong style={{ color: 'var(--text)' }}>{pending?.occ.title}</strong> repeats. Apply this to just this one, or every event in the series?
        </p>
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={() => setPending(null)}>
          Cancel
        </button>
        <span className="spacer" />
        <button
          className={`btn ${pending?.danger ? 'danger' : ''}`}
          onClick={() => {
            pending?.apply('series')
            setPending(null)
          }}
        >
          All events
        </button>
        <button
          className={`btn ${pending?.danger ? 'danger solid' : 'primary'}`}
          autoFocus
          onClick={() => {
            pending?.apply('occurrence')
            setPending(null)
          }}
        >
          Only this one
        </button>
      </div>
    </Modal>
  )

  return { ask, dialog }
}
