import { memo, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '../../data/store'
import { annotationsHitBy, clientToPage, paintStrokes, roundPoint, simplifyStroke, tracePath } from '../../lib/annotations'
import type { Annotation, AnnotationTool, PdfPoint } from '../../types/models'
import { AnnotationDomLayer } from './AnnotationDomLayer'
import type { PdfDocumentProxy } from './pdfjs'
import { usePdfTools } from './pdfToolsStore'

interface Props {
  doc: PdfDocumentProxy
  pdfId: string
  pageNumber: number
  /** Page size in PDF points at scale 1. */
  size: { width: number; height: number }
  scale: number
  visible: boolean
  annotations: Annotation[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAnnotationAdded: (id: string) => void
  onAnnotationsDeleted: (annotations: Annotation[]) => void
}

/**
 * One page: the pdf.js bitmap, an ink canvas, a DOM layer for text/sticky
 * annotations and an input layer that captures pointer events for the tools.
 *
 * Everything is positioned in CSS px = pageUnits * scale, so zoom and resize
 * only change `scale`; annotation data never changes.
 */
export const PdfPage = memo(function PdfPage({ doc, pdfId, pageNumber, size, scale, visible, annotations, selectedId, onSelect, onAnnotationAdded, onAnnotationsDeleted }: Props) {
  const pdfCanvas = useRef<HTMLCanvasElement>(null)
  const inkCanvas = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)
  const renderTask = useRef<{ cancel: () => void } | null>(null)
  const { tool, inkColor, highlightColor, inkWidth } = usePdfTools()
  const addAnnotation = useStore((s) => s.addAnnotation)
  const deleteAnnotations = useStore((s) => s.deleteAnnotations)

  const cssW = Math.round(size.width * scale)
  const cssH = Math.round(size.height * scale)
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1

  // ---- Render the PDF bitmap when visible (and re-render on zoom).
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    const canvas = pdfCanvas.current
    if (!canvas) return
    void (async () => {
      try {
        const page = await doc.getPage(pageNumber)
        if (cancelled) return
        const viewport = page.getViewport({ scale: scale * dpr })
        // Render offscreen so the old bitmap stays on screen (CSS-scaled) until the new one is ready.
        const off = document.createElement('canvas')
        off.width = Math.floor(viewport.width)
        off.height = Math.floor(viewport.height)
        const ctx = off.getContext('2d', { alpha: false })!
        renderTask.current?.cancel()
        const task = page.render({ canvasContext: ctx, viewport, canvas: off })
        renderTask.current = task
        await task.promise
        if (cancelled) return
        canvas.width = off.width
        canvas.height = off.height
        canvas.getContext('2d', { alpha: false })!.drawImage(off, 0, 0)
        setRendered(true)
      } catch (err) {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') console.error(err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [doc, pageNumber, scale, dpr, visible])

  // ---- Repaint ink whenever annotations or scale change.
  const repaintInk = () => {
    const c = inkCanvas.current
    if (!c) return
    c.width = Math.floor(cssW * dpr)
    c.height = Math.floor(cssH * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    paintStrokes(ctx, annotations, pageNumber, scale)
  }
  useLayoutEffect(repaintInk, [annotations, scale, cssW, cssH, dpr, pageNumber, visible])

  // ---- Pointer interactions
  const inputRef = useRef<HTMLDivElement>(null)
  const drawing = useRef<{ pointerId: number; points: PdfPoint[]; last: { x: number; y: number } } | null>(null)
  const erasing = useRef<{ pointerId: number; erased: Set<string> } | null>(null)

  const toPage = (e: { clientX: number; clientY: number }): PdfPoint => {
    const rect = inputRef.current!.getBoundingClientRect()
    return clientToPage({ x: e.clientX - rect.left, y: e.clientY - rect.top }, scale)
  }

  const strokeStyle = () => ({
    color: tool === 'highlight' ? highlightColor : inkColor,
    width: tool === 'highlight' ? inkWidth * 5 : inkWidth,
  })

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType !== 'pen') return
    // Stop the browser's mousedown default (focus change / text selection) so a
    // textarea we focus for a new text box keeps focus.
    e.preventDefault()
    if (tool === 'ink' || tool === 'highlight') {
      // Palm rejection: when a pen is active, ignore touch.
      if (e.pointerType === 'touch' && drawing.current) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const p = toPage(e)
      drawing.current = { pointerId: e.pointerId, points: [p], last: { x: p.x * scale, y: p.y * scale } }
      onSelect(null)
      const ctx = inkCanvas.current!.getContext('2d')!
      const st = strokeStyle()
      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.lineCap = tool === 'highlight' ? 'butt' : 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = st.color
      ctx.lineWidth = st.width * scale
      if (tool === 'highlight') {
        ctx.globalAlpha = 0.4
        ctx.globalCompositeOperation = 'multiply'
      }
      // A dot for taps.
      tracePath(ctx, [{ x: p.x * scale, y: p.y * scale }])
      ctx.stroke()
      return
    }
    if (tool === 'eraser') {
      e.currentTarget.setPointerCapture(e.pointerId)
      erasing.current = { pointerId: e.pointerId, erased: new Set() }
      eraseAt(toPage(e))
      return
    }
    if (tool === 'text') {
      const p = roundPoint(toPage(e))
      const a = addAnnotation({ pdfId, page: pageNumber, type: 'text', color: inkColor, x: p.x, y: p.y, w: Math.min(220, size.width - p.x), fontSize: 13, text: '' })
      onAnnotationAdded(a.id)
      onSelect(a.id)
      usePdfTools.getState().setTool('select')
      return
    }
    if (tool === 'sticky') {
      const p = roundPoint(toPage(e))
      const a = addAnnotation({ pdfId, page: pageNumber, type: 'sticky', color: '#ffe83b', x: p.x, y: p.y, text: '' })
      onAnnotationAdded(a.id)
      onSelect(a.id)
      usePdfTools.getState().setTool('select')
      return
    }
  }

  const eraseAt = (p: PdfPoint) => {
    console.log('DBG eraseAt', JSON.stringify(p), annotations.length, JSON.stringify(annotations.filter((a) => a.page === pageNumber).map((a) => a.type)), scale)
    const hits = annotationsHitBy(annotations, pageNumber, p, 6 / scale).filter((a) => !erasing.current?.erased.has(a.id))
    if (hits.length === 0) return
    for (const h of hits) erasing.current?.erased.add(h.id)
    onAnnotationsDeleted(hits)
    deleteAnnotations(hits.map((h) => h.id))
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drawing.current && drawing.current.pointerId === e.pointerId) {
      const ctx = inkCanvas.current!.getContext('2d')!
      const events = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent]
      const d = drawing.current
      for (const ev of events.length ? events : [e.nativeEvent]) {
        const p = toPage(ev)
        const px = { x: p.x * scale, y: p.y * scale }
        ctx.beginPath()
        ctx.moveTo(d.last.x, d.last.y)
        ctx.lineTo(px.x, px.y)
        ctx.stroke()
        d.last = px
        d.points.push(p)
      }
      return
    }
    if (erasing.current && erasing.current.pointerId === e.pointerId) eraseAt(toPage(e))
  }

  const finishStroke = () => {
    const d = drawing.current
    if (!d) return
    drawing.current = null
    const ctx = inkCanvas.current?.getContext('2d')
    ctx?.restore()
    const st = strokeStyle()
    const pts = simplifyStroke(d.points, 0.5 / scale).map(roundPoint)
    const a = addAnnotation({ pdfId, page: pageNumber, type: tool === 'highlight' ? 'highlight' : 'ink', color: st.color, width: st.width, strokes: [pts] })
    onAnnotationAdded(a.id)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drawing.current?.pointerId === e.pointerId) finishStroke()
    if (erasing.current?.pointerId === e.pointerId) erasing.current = null
  }

  const passthrough = tool === 'select'
  const toolClass = `tool-${tool as AnnotationTool}`

  return (
    <div className={`pdf-page-wrap ${rendered ? '' : 'loading'}`} style={{ width: cssW, height: cssH }} data-page={pageNumber}>
      <canvas ref={pdfCanvas} className="pdf-canvas" style={{ width: cssW, height: cssH }} />
      <canvas ref={inkCanvas} className="ink-canvas" style={{ width: cssW, height: cssH }} data-testid={`ink-${pageNumber}`} />
      <div className="dom-layer">
        <AnnotationDomLayer pdfId={pdfId} page={pageNumber} scale={scale} annotations={annotations} selectedId={selectedId} onSelect={onSelect} pageSize={size} interactive={passthrough} />
      </div>
      <div
        ref={inputRef}
        className={`input-layer ${passthrough ? 'passthrough' : ''} ${toolClass}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={() => {
          if (drawing.current) finishStroke()
          erasing.current = null
        }}
      />
      <div className="page-num">{pageNumber}</div>
    </div>
  )
})
