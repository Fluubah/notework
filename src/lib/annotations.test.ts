import { describe, expect, it } from 'vitest'
import type { Annotation } from '../types/models'
import { annotationsHitBy, clientToPage, fitWidthScale, pageToClient, simplifyStroke, strokeHit } from './annotations'

describe('coordinate transforms', () => {
  it('round-trips at any scale', () => {
    for (const scale of [0.5, 1, 1.37, 3]) {
      const p = clientToPage({ x: 123.4, y: 56.7 }, scale)
      const back = pageToClient(p, scale)
      expect(back.x).toBeCloseTo(123.4)
      expect(back.y).toBeCloseTo(56.7)
    }
  })
  it('scales linearly: a point stored at zoom 1 lands at 2x the pixels at zoom 2', () => {
    const stored = clientToPage({ x: 100, y: 40 }, 1)
    expect(pageToClient(stored, 2)).toEqual({ x: 200, y: 80 })
    expect(pageToClient(stored, 0.5)).toEqual({ x: 50, y: 20 })
  })
  it('computes fit-width', () => {
    expect(fitWidthScale(612 + 40, 612, 20)).toBeCloseTo(1)
    expect(fitWidthScale(1224, 612)).toBeCloseTo(2)
  })
})

describe('simplifyStroke', () => {
  it('keeps endpoints and drops near-duplicate points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0 },
      { x: 0.2, y: 0 },
      { x: 5, y: 0 },
      { x: 5.1, y: 0 },
      { x: 10, y: 0 },
    ]
    expect(simplifyStroke(pts, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ])
  })
})

describe('hit testing', () => {
  const ink: Annotation = { id: 'a', pdfId: 'p', page: 1, type: 'ink', color: '#000', width: 2, strokes: [[{ x: 0, y: 0 }, { x: 100, y: 0 }]], createdAt: '' }
  it('hits near a segment and misses far away', () => {
    expect(strokeHit(ink.strokes, { x: 50, y: 2 }, 3)).toBe(true)
    expect(strokeHit(ink.strokes, { x: 50, y: 10 }, 3)).toBe(false)
    expect(strokeHit(ink.strokes, { x: 120, y: 0 }, 3)).toBe(false)
  })
  it('filters by page and type', () => {
    const text: Annotation = { id: 't', pdfId: 'p', page: 2, type: 'text', color: '#000', x: 10, y: 10, w: 100, fontSize: 12, text: 'hi', createdAt: '' }
    expect(annotationsHitBy([ink, text], 1, { x: 50, y: 1 }, 2).map((a) => a.id)).toEqual(['a'])
    expect(annotationsHitBy([ink, text], 2, { x: 20, y: 20 }, 2).map((a) => a.id)).toEqual(['t'])
    expect(annotationsHitBy([ink, text], 2, { x: 200, y: 20 }, 2)).toEqual([])
  })
})
