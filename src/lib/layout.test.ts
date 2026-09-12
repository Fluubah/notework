import { describe, expect, it } from 'vitest'
import { layoutColumns } from './layout'

const span = (s: number, e: number) => ({ start: s, end: e })

describe('layoutColumns', () => {
  it('gives non-overlapping items full width', () => {
    const out = layoutColumns([span(0, 10), span(10, 20)], (x) => x)
    expect(out.every((p) => p.cols === 1 && p.span === 1)).toBe(true)
  })
  it('splits overlapping items into columns', () => {
    const out = layoutColumns([span(0, 10), span(5, 15)], (x) => x)
    expect(out.map((p) => [p.col, p.cols])).toEqual([
      [0, 2],
      [1, 2],
    ])
  })
  it('lets an item expand over free columns', () => {
    const a = span(0, 10)
    const b = span(0, 5)
    const c = span(5, 10)
    const out = layoutColumns([a, b, c], (x) => x)
    const byItem = new Map(out.map((p) => [p.item, p]))
    expect(byItem.get(a)?.col).toBe(0)
    expect(byItem.get(b)?.col).toBe(1)
    expect(byItem.get(c)?.col).toBe(1)
    expect(out.every((p) => p.cols === 2)).toBe(true)
  })
  it('separates independent clusters', () => {
    const out = layoutColumns([span(0, 10), span(5, 15), span(20, 30)], (x) => x)
    expect(out[2].cols).toBe(1)
  })
})
