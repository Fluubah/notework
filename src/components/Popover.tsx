import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface Anchor {
  x: number
  y: number
  /** Optional rect to avoid covering. */
  rect?: DOMRect
}

interface PopoverProps {
  anchor: Anchor | null
  onClose: () => void
  children: ReactNode
  /** Preferred placement relative to the anchor rect. */
  placement?: 'bottom-start' | 'bottom-end' | 'right' | 'left' | 'auto'
  width?: number
  className?: string
  /** Called on Escape / outside click. Defaults to onClose. */
  closeOnOutside?: boolean
}

/**
 * Floating, viewport-clamped popover anchored at a point or rect.
 * Kept dependency-free on purpose; it's small and predictable.
 */
export function Popover({ anchor, onClose, children, placement = 'auto', width, className, closeOnOutside = true }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const el = ref.current
    const { width: w, height: h } = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 8
    let x = anchor.x
    let y = anchor.y
    const r = anchor.rect
    if (r) {
      if (placement === 'bottom-start') {
        x = r.left
        y = r.bottom + 6
      } else if (placement === 'bottom-end') {
        x = r.right - w
        y = r.bottom + 6
      } else if (placement === 'right') {
        x = r.right + 8
        y = r.top
      } else if (placement === 'left') {
        x = r.left - w - 8
        y = r.top
      } else {
        // auto: prefer right, then left, then below
        if (r.right + 8 + w < vw - margin) {
          x = r.right + 8
          y = r.top
        } else if (r.left - w - 8 > margin) {
          x = r.left - w - 8
          y = r.top
        } else {
          x = r.left
          y = r.bottom + 6
        }
      }
    }
    x = Math.max(margin, Math.min(x, vw - w - margin))
    y = Math.max(margin, Math.min(y, vh - h - margin))
    setPos({ left: x, top: y, width, visibility: 'visible' })
    // Focus requests made while the popover was still hidden don't take; retry now.
    const id = requestAnimationFrame(() => el.querySelector<HTMLElement>('[data-autofocus]')?.focus())
    return () => cancelAnimationFrame(id)
  }, [anchor, placement, width])

  // Latest callbacks via refs so the listeners are registered once per open,
  // not re-armed (with a frame of deafness) on every re-render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const closeOnOutsideRef = useRef(closeOnOutside)
  closeOnOutsideRef.current = closeOnOutside
  const isOpen = !!anchor
  useLayoutEffect(() => {
    if (!isOpen) return
    const onDown = (e: MouseEvent) => {
      if (!closeOnOutsideRef.current) return
      const t = e.target as HTMLElement
      // Clicks inside a modal opened from this popover shouldn't dismiss it.
      if (t.closest('.overlay, .modal')) return
      if (ref.current && !ref.current.contains(t)) onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    // Defer so the click that opened the popover doesn't close it.
    const id = requestAnimationFrame(() => {
      document.addEventListener('mousedown', onDown)
      document.addEventListener('keydown', onKey, true)
    })
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [isOpen])

  if (!anchor) return null
  return createPortal(
    <div ref={ref} className={`popover ${className ?? ''}`} style={pos} role="dialog">
      {children}
    </div>,
    document.body,
  )
}

export function anchorFromEvent(e: { currentTarget: Element; clientX?: number; clientY?: number }): Anchor {
  const rect = e.currentTarget.getBoundingClientRect()
  return { x: e.clientX ?? rect.left, y: e.clientY ?? rect.bottom, rect }
}
