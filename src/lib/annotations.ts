import type { Annotation, PdfPoint } from '../types/models'

/**
 * All annotation geometry is stored in *PDF page space*: points, origin at the
 * top-left of the unrotated page, as reported by `page.getViewport({ scale: 1 })`.
 * Rendering at any zoom is a pure multiply, which is what keeps ink aligned
 * across zoom, scroll and resize.
 */

/** Client (CSS px, relative to the page element's top-left) → PDF page space. */
export function clientToPage(pt: { x: number; y: number }, scale: number): PdfPoint {
  return { x: pt.x / scale, y: pt.y / scale }
}

/** PDF page space → CSS px relative to the page element. */
export function pageToClient(pt: PdfPoint, scale: number): { x: number; y: number } {
  return { x: pt.x * scale, y: pt.y * scale }
}

/** Fit-to-width scale for a page of `pageWidth` points inside `containerWidth` px. */
export function fitWidthScale(containerWidth: number, pageWidth: number, padding = 0): number {
  return Math.max(0.1, (containerWidth - padding * 2) / pageWidth)
}

/** Radial-distance simplification: drop points closer than `minDist` to the last kept one. */
export function simplifyStroke(points: PdfPoint[], minDist = 0.75): PdfPoint[] {
  if (points.length <= 2) return points
  const out: PdfPoint[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1]
    const p = points[i]
    if (Math.hypot(p.x - last.x, p.y - last.y) >= minDist) out.push(p)
  }
  out.push(points[points.length - 1])
  return out
}

/** Round to 0.1pt to keep stored JSON compact. */
export function roundPoint(p: PdfPoint): PdfPoint {
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }
}

function distToSegment(p: PdfPoint, a: PdfPoint, b: PdfPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Is `p` within `radius` (page units) of any stroke segment? */
export function strokeHit(strokes: PdfPoint[][], p: PdfPoint, radius: number): boolean {
  for (const s of strokes) {
    if (s.length === 1) {
      if (Math.hypot(s[0].x - p.x, s[0].y - p.y) <= radius) return true
      continue
    }
    for (let i = 0; i < s.length - 1; i++) if (distToSegment(p, s[i], s[i + 1]) <= radius) return true
  }
  return false
}

/** Annotations on a page that the eraser at `p` should remove. */
export function annotationsHitBy(annotations: Annotation[], page: number, p: PdfPoint, radius: number): Annotation[] {
  return annotations.filter((a) => {
    if (a.page !== page) return false
    if (a.type === 'ink' || a.type === 'highlight') return strokeHit(a.strokes, p, radius + a.width / 2)
    if (a.type === 'text') return p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.fontSize * 3
    if (a.type === 'sticky') return Math.hypot(a.x - p.x, a.y - p.y) <= 14
    return false
  })
}

/** Draw a smooth polyline through points (quadratic midpoints). Coordinates already scaled. */
export function tracePath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length === 0) return
  ctx.beginPath()
  if (pts.length === 1) {
    ctx.moveTo(pts[0].x, pts[0].y)
    ctx.lineTo(pts[0].x + 0.01, pts[0].y)
    return
  }
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
  }
  const last = pts[pts.length - 1]
  ctx.lineTo(last.x, last.y)
}

/** Paint every ink/highlight annotation for a page onto a canvas at `scale` (device pixels handled by caller). */
export function paintStrokes(ctx: CanvasRenderingContext2D, annotations: Annotation[], page: number, scale: number) {
  for (const a of annotations) {
    if (a.page !== page) continue
    if (a.type !== 'ink' && a.type !== 'highlight') continue
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = a.color
    ctx.lineWidth = a.width * scale
    if (a.type === 'highlight') {
      ctx.globalAlpha = 0.4
      ctx.globalCompositeOperation = 'multiply'
      ctx.lineCap = 'butt'
    }
    for (const s of a.strokes) {
      tracePath(
        ctx,
        s.map((p) => pageToClient(p, scale)),
      )
      ctx.stroke()
    }
    ctx.restore()
  }
}
