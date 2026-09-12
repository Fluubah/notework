import { create } from 'zustand'
import type { AnnotationTool } from '../../types/models'

/** Tool state persists across PDFs within a session (not saved). */
interface PdfTools {
  tool: AnnotationTool
  setTool(t: AnnotationTool): void
  inkColor: string
  highlightColor: string
  setColor(hex: string): void
  inkWidth: number
  setInkWidth(w: number): void
  recentColors: string[]
}

export const INK_COLORS = ['#1b1d24', '#e5484d', '#f5a623', '#2fa66c', '#3c82f6']
export const HIGHLIGHT_COLORS = ['#ffe83b', '#7dffa0', '#7fd6ff', '#ffa1e0', '#ffb36b']
export const INK_WIDTHS = [1.5, 3, 6]

export const usePdfTools = create<PdfTools>()((set, get) => ({
  tool: 'ink',
  setTool: (tool) => set({ tool }),
  inkColor: INK_COLORS[0],
  highlightColor: HIGHLIGHT_COLORS[0],
  setColor: (hex) => {
    const isHl = get().tool === 'highlight'
    set(isHl ? { highlightColor: hex } : { inkColor: hex })
  },
  inkWidth: INK_WIDTHS[1],
  setInkWidth: (inkWidth) => set({ inkWidth }),
  recentColors: [],
}))
