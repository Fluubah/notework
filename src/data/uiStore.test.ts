import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MOBILE_QUERY } from '../lib/media'

const PREFS_KEY = 'notework:ui:v1'

/** Stub matchMedia so the store sees a phone-sized (or desktop) viewport. */
function setViewport(mobile: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mobile && query === MOBILE_QUERY,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }))
}

async function freshStore() {
  vi.resetModules()
  const mod = await import('./uiStore')
  return mod.useUi
}

describe('uiStore sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('starts open on desktop when the preference says so', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sidebarOpen: true }))
    setViewport(false)
    const useUi = await freshStore()
    expect(useUi.getState().sidebarOpen).toBe(true)
  })

  it('starts closed on a phone even when the desktop preference is open', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sidebarOpen: true }))
    setViewport(true)
    const useUi = await freshStore()
    expect(useUi.getState().sidebarOpen).toBe(false)
  })

  it('can be reopened on a phone, so the drawer is always reachable', async () => {
    setViewport(true)
    const useUi = await freshStore()
    useUi.getState().toggleSidebar()
    expect(useUi.getState().sidebarOpen).toBe(true)
    useUi.getState().setSidebarOpen(false)
    expect(useUi.getState().sidebarOpen).toBe(false)
  })

  it('does not overwrite the desktop preference when the phone drawer toggles', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sidebarOpen: true }))
    setViewport(true)
    const useUi = await freshStore()
    useUi.getState().toggleSidebar()
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).sidebarOpen).toBe(true)
  })

  it('persists the preference on desktop', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sidebarOpen: true }))
    setViewport(false)
    const useUi = await freshStore()
    useUi.getState().toggleSidebar()
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).sidebarOpen).toBe(false)
  })
})
