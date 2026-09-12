import { useEffect } from 'react'

export interface Hotkey {
  /** e.g. "n", "mod+k", "shift+?", "ArrowLeft" */
  combo: string
  handler: (e: KeyboardEvent) => void
  /** Fire even when focus is inside an input/textarea/contenteditable. */
  allowInInput?: boolean
}

export function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function matches(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  const mods = new Set(parts.slice(0, -1))
  const wantMod = mods.has('mod')
  const wantShift = mods.has('shift')
  const wantAlt = mods.has('alt')
  const hasMod = e.metaKey || e.ctrlKey
  if (wantMod !== hasMod) return false
  if (wantAlt !== e.altKey) return false
  // For '?' the shift is implicit in the key itself.
  if (wantShift !== e.shiftKey && key.length > 1) return false
  if (key.length === 1 && !wantShift && e.shiftKey && key !== '?') return false
  return e.key.toLowerCase() === key
}

/** Global keyboard shortcuts. Skips text inputs unless `allowInInput`. */
export function useHotkeys(hotkeys: Hotkey[], deps: unknown[] = []) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const inInput = isEditableTarget(e.target)
      for (const h of hotkeys) {
        if (inInput && !h.allowInInput) continue
        if (matches(e, h.combo)) {
          e.preventDefault()
          h.handler(e)
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = isMac ? '⌘' : 'Ctrl'
