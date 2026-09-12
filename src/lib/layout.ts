/**
 * Column layout for overlapping timed events (the classic "Google Calendar"
 * packing): events that overlap are placed into side-by-side columns; each
 * event expands rightwards over free columns.
 */
export interface Positioned<T> {
  item: T
  /** 0-based column index. */
  col: number
  /** Number of columns this item spans. */
  span: number
  /** Total columns in this item's cluster. */
  cols: number
}

interface Span {
  start: number
  end: number
}

export function layoutColumns<T>(items: T[], getSpan: (t: T) => Span): Positioned<T>[] {
  const sorted = items
    .map((item) => ({ item, ...getSpan(item) }))
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const out: Positioned<T>[] = []
  // Group into clusters of transitively-overlapping items.
  let cluster: typeof sorted = []
  let clusterEnd = -Infinity
  const flush = () => {
    if (cluster.length === 0) return
    const columns: Span[][] = []
    const placed: { entry: (typeof sorted)[number]; col: number }[] = []
    for (const entry of cluster) {
      let col = 0
      while (columns[col]?.some((s) => s.start < entry.end && s.end > entry.start)) col++
      ;(columns[col] ??= []).push(entry)
      placed.push({ entry, col })
    }
    const cols = columns.length
    for (const { entry, col } of placed) {
      // Expand to the right while no later column has an overlapping item.
      let span = 1
      while (col + span < cols && !columns[col + span].some((s) => s.start < entry.end && s.end > entry.start)) span++
      out.push({ item: entry.item, col, span, cols })
    }
    cluster = []
    clusterEnd = -Infinity
  }
  for (const entry of sorted) {
    if (entry.start >= clusterEnd) flush()
    cluster.push(entry)
    clusterEnd = Math.max(clusterEnd, entry.end)
  }
  flush()
  return out
}
