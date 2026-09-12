import type { Note, PdfDocument } from '../../types/models'

/** A row in the notebook list: either a note or a PDF. */
export type NotebookItem = { type: 'note'; item: Note } | { type: 'pdf'; item: PdfDocument }

export function itemId(i: NotebookItem) {
  return `${i.type}:${i.item.id}`
}

export function itemTitle(i: NotebookItem) {
  return i.type === 'note' ? i.item.title || 'Untitled note' : i.item.name
}

/** Extract a short plain-text excerpt from a ProseMirror JSON doc. */
export function excerptFromDoc(doc: unknown, max = 140): string {
  const parts: string[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const node = n as { type?: string; text?: string; content?: unknown[] }
    if (node.type === 'text' && node.text) parts.push(node.text)
    if (node.content) {
      for (const c of node.content) walk(c)
      if (node.type && node.type !== 'doc' && node.type !== 'text') parts.push(' ')
    }
  }
  walk(doc)
  return parts.join('').replace(/\s+/g, ' ').trim().slice(0, max)
}
