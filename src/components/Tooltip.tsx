import { cloneElement, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  content: ReactNode
  children: ReactElement<Record<string, unknown>>
  delay?: number
  side?: 'top' | 'bottom'
}

/** Lightweight hover tooltip. Wrap a single element. */
export function Tooltip({ content, children, delay = 450, side = 'top' }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef<number | null>(null)

  const show = (el: Element) => {
    const r = el.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: side === 'top' ? r.top - 6 : r.bottom + 6 })
  }
  const props = {
    onMouseEnter: (e: React.MouseEvent) => {
      const el = e.currentTarget
      timer.current = window.setTimeout(() => show(el), delay)
    },
    onMouseLeave: () => {
      if (timer.current) window.clearTimeout(timer.current)
      setPos(null)
    },
    onMouseDown: () => {
      if (timer.current) window.clearTimeout(timer.current)
      setPos(null)
    },
  }
  return (
    <>
      {/* False positive: `props` only holds event handlers, and the timer ref
          is read when one of them fires, never during render. oxlint can't
          see through the object literal to tell the difference. */}
      {/* oxlint-disable-next-line react/refs */}
      {cloneElement(children, props)}
      {pos &&
        content &&
        createPortal(
          <div
            className="tooltip"
            style={{
              left: pos.x,
              top: pos.y,
              transform: side === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  )
}
