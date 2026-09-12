import type { Anchor } from './Popover'

/** Anchor a popover to the element (or pointer position) of an event. */
export function anchorFromEvent(e: { currentTarget: Element; clientX?: number; clientY?: number }): Anchor {
  const rect = e.currentTarget.getBoundingClientRect()
  return { x: e.clientX ?? rect.left, y: e.clientY ?? rect.bottom, rect }
}
