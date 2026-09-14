import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { IconClose, IconSticky, IconTrash } from '../../components/Icons'
import { Popover, type Anchor } from '../../components/Popover'
import { useStore } from '../../data/store'
import { roundPoint } from '../../lib/annotations'
import type { Annotation, StickyAnnotation, TextAnnotation } from '../../types/models'

interface Props {
  pdfId: string
  page: number
  scale: number
  annotations: Annotation[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  pageSize: { width: number; height: number }
  /** True when the select tool is active (text/stickies can be edited/dragged). */
  interactive: boolean
}

/** Text boxes and sticky notes, positioned in CSS px = page units × scale. */
export function AnnotationDomLayer({ page, scale, annotations, selectedId, onSelect, pageSize, interactive }: Props) {
  return (
    <>
      {annotations.map((a) => {
        if (a.page !== page) return null
        if (a.type === 'text') return <TextBox key={a.id} a={a} scale={scale} selected={selectedId === a.id} onSelect={onSelect} pageSize={pageSize} interactive={interactive} />
        if (a.type === 'sticky') return <Sticky key={a.id} a={a} scale={scale} selected={selectedId === a.id} onSelect={onSelect} interactive={interactive} />
        return null
      })}
    </>
  )
}

function useDrag(onMove: (dx: number, dy: number) => void, onEnd?: () => void) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (!start.current || start.current.id !== e.pointerId) return
      onMove(e.clientX - start.current.x, e.clientY - start.current.y)
      start.current = { ...start.current, x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e: ReactPointerEvent) => {
      if (start.current?.id === e.pointerId) {
        start.current = null
        onEnd?.()
      }
    },
  }
}

function TextBox({ a, scale, selected, onSelect, pageSize, interactive }: { a: TextAnnotation; scale: number; selected: boolean; onSelect: (id: string | null) => void; pageSize: { width: number; height: number }; interactive: boolean }) {
  const updateAnnotation = useStore((s) => s.updateAnnotation)
  const deleteAnnotation = useStore((s) => s.deleteAnnotation)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(a.text)
  // The textarea holds a local draft that is committed on blur. When the
  // stored text changes underneath us (undo, or an edit from elsewhere),
  // adopt it during render rather than committing the stale draft first.
  const [syncedText, setSyncedText] = useState(a.text)
  if (syncedText !== a.text) {
    setSyncedText(a.text)
    setText(a.text)
  }

  useEffect(() => {
    if (!selected || a.text !== '') return
    // Focus after the current pointer sequence settles.
    const id = requestAnimationFrame(() => {
      if (taRef.current && document.activeElement !== taRef.current) taRef.current.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [selected, a.text])

  // Auto-height
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = `${ta.scrollHeight}px`
  }, [text, scale, a.w])

  const move = useDrag((dx, dy) => {
    const nx = Math.max(0, Math.min(pageSize.width - 20, a.x + dx / scale))
    const ny = Math.max(0, Math.min(pageSize.height - 10, a.y + dy / scale))
    updateAnnotation(a.id, roundPoint({ x: nx, y: ny }))
  })
  const resize = useDrag((dx) => {
    updateAnnotation(a.id, { w: Math.max(40, Math.min(pageSize.width - a.x, a.w + dx / scale)) })
  })

  const commit = () => {
    if (text !== a.text) updateAnnotation(a.id, { text })
    if (text.trim() === '') deleteAnnotation(a.id)
  }

  return (
    <div
      className={`ann-text ${selected ? 'selected' : ''}`}
      style={{ left: a.x * scale, top: a.y * scale, width: a.w * scale, color: a.color, fontSize: a.fontSize * scale, pointerEvents: interactive ? 'auto' : 'none' }}
      onPointerDown={(e) => {
        e.stopPropagation()
        onSelect(a.id)
      }}
      data-testid="ann-text"
    >
      <div className="handle" {...move}>
        drag
      </div>
      <div
        className="del"
        role="button"
        aria-label="Delete text box"
        onPointerDown={(e) => {
          e.stopPropagation()
          deleteAnnotation(a.id)
        }}
      >
        <IconClose />
      </div>
      <textarea
        ref={taRef}
        value={text}
        rows={1}
        placeholder="Type…"
        style={{ fontSize: 'inherit' }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onFocus={() => onSelect(a.id)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.currentTarget.blur()
            onSelect(null)
          }
          e.stopPropagation()
        }}
        spellCheck={false}
      />
      <div className="resize" {...resize} />
    </div>
  )
}

function Sticky({ a, scale, selected, onSelect, interactive }: { a: StickyAnnotation; scale: number; selected: boolean; onSelect: (id: string | null) => void; interactive: boolean }) {
  const updateAnnotation = useStore((s) => s.updateAnnotation)
  const deleteAnnotation = useStore((s) => s.deleteAnnotation)
  // Held as state rather than a ref so the marker can be measured during the
  // render that opens the popover (see below).
  const [markerEl, setMarkerEl] = useState<HTMLDivElement | null>(null)
  const [text, setText] = useState(a.text)
  const moved = useRef(false)

  // See TextBox: adopt an externally changed note body during render.
  const [syncedText, setSyncedText] = useState(a.text)
  if (syncedText !== a.text) {
    setSyncedText(a.text)
    setText(a.text)
  }

  // Measure the marker as the selection changes, instead of opening the
  // popover unanchored and repositioning it from an effect. Keyed on the
  // element itself rather than on `selected`, because a note that is selected
  // the moment it is created renders before its callback ref has run: the
  // element arriving is what triggers the measurement in that case.
  const [anchorState, setAnchorState] = useState<{ target: HTMLDivElement | null; anchor: Anchor | null }>({ target: null, anchor: null })
  const anchorTarget = selected ? markerEl : null
  if (anchorState.target !== anchorTarget) {
    const r = anchorTarget?.getBoundingClientRect()
    setAnchorState({ target: anchorTarget, anchor: r ? { x: r.right, y: r.top, rect: r } : null })
  }
  const anchor = anchorState.anchor

  const drag = useDrag(
    (dx, dy) => {
      moved.current = true
      updateAnnotation(a.id, roundPoint({ x: a.x + dx / scale, y: a.y + dy / scale }))
    },
    () => {
      if (!moved.current) onSelect(selected ? null : a.id)
      moved.current = false
    },
  )

  return (
    <>
      <div
        ref={setMarkerEl}
        className="ann-sticky"
        style={{ left: a.x * scale, top: a.y * scale, background: a.color, pointerEvents: interactive ? 'auto' : 'none' }}
        {...drag}
        title={a.text || 'Sticky note'}
        data-testid="ann-sticky"
      >
        <IconSticky />
      </div>
      <Popover
        anchor={anchor}
        onClose={() => {
          if (text !== a.text) updateAnnotation(a.id, { text })
          onSelect(null)
        }}
        placement="auto"
        className="sticky-pop"
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a note…" data-autofocus onBlur={() => text !== a.text && updateAnnotation(a.id, { text })} />
        <div className="row">
          <div className="ink-colors">
            {['#ffe83b', '#ffb36b', '#7dffa0', '#7fd6ff', '#ffa1e0'].map((c) => (
              <button key={c} className={`ink-color ${a.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => updateAnnotation(a.id, { color: c })} aria-label={`Colour ${c}`} />
            ))}
          </div>
          <button
            className="btn ghost sm danger"
            onClick={() => {
              deleteAnnotation(a.id)
              onSelect(null)
            }}
          >
            <IconTrash /> Delete
          </button>
        </div>
      </Popover>
    </>
  )
}
