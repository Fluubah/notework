import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from './Icons'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** Close when the backdrop is clicked. Defaults to true. */
  dismissible?: boolean
  className?: string
}

export function Modal({ open, onClose, title, children, footer, wide, dismissible = true, className }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    const prev = document.activeElement as HTMLElement | null
    // Focus first focusable element
    requestAnimationFrame(() => {
      const el = ref.current?.querySelector<HTMLElement>('input, textarea, [contenteditable], button:not([data-close])')
      el?.focus()
    })
    return () => {
      document.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={ref} role="dialog" aria-modal="true" className={`modal ${wide ? 'wide' : ''} ${className ?? ''}`}>
        {title !== undefined && (
          <div className="modal-header">
            <h2 style={{ fontSize: 16 }}>{title}</h2>
            <button data-close className="btn ghost icon" aria-label="Close" onClick={onClose}>
              <IconClose />
            </button>
          </div>
        )}
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Extra choice buttons, rendered before Cancel. */
  extra?: ReactNode
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel, extra }: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <span className="spacer" />
          {extra}
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'danger solid' : 'primary'}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </>
      }
    >
      {message && <div className="modal-body muted">{message}</div>}
    </Modal>
  )
}
