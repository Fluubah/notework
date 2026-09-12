import { create } from 'zustand'

interface Toast {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
}

interface ToastState {
  toasts: Toast[]
  push(t: Omit<Toast, 'id'>, ttl?: number): void
  dismiss(id: number): void
}

let seq = 0
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(t, ttl = 5000) {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    window.setTimeout(() => get().dismiss(id), ttl)
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

export const toast = (message: string, opts?: { actionLabel?: string; onAction?: () => void; ttl?: number }) =>
  useToasts.getState().push({ message, actionLabel: opts?.actionLabel, onAction: opts?.onAction }, opts?.ttl)

export function ToastHost() {
  const { toasts, dismiss } = useToasts()
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.message}</span>
          {t.actionLabel && (
            <button
              onClick={() => {
                t.onAction?.()
                dismiss(t.id)
              }}
            >
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
