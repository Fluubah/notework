import { create } from 'zustand'
import { localFileStore, localRepository, setBackends } from '../index'
import { useStore } from '../store'
import { newId } from '../../lib/ids'
import { getSupabase, isSyncConfigured } from './supabaseClient'
import { SupabaseRemoteFileStore, SupabaseSnapshotStore } from './supabaseRemote'
import { LocalSyncMeta, SyncedRepository } from './syncedRepository'
import { SyncedFileStore } from './syncedFileStore'
import { stopPublishing, watchAndPublish } from './calendarFeed'
import type { SyncStatus } from './types'

const DEVICE_KEY = 'notework:device:v1'

/** A stable id for this browser, so the UI can say where a change came from. */
function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const id = newId()
    localStorage.setItem(DEVICE_KEY, id)
    return id
  } catch {
    return 'unknown-device'
  }
}

export interface SyncAccount {
  id: string
  email: string | null
}

interface SyncState {
  /** False when the build has no Supabase credentials: sync is unavailable. */
  configured: boolean
  /** Null when signed out — the app is local-only. */
  account: SyncAccount | null
  status: SyncStatus
  /** True while a sign-in/up/out request is in flight. */
  authBusy: boolean
  authError: string | null
  /** Set after sign-up when the project requires email confirmation. */
  notice: string | null

  init(): void
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  syncNow(): Promise<void>
  dismissNotice(): void
}

/**
 * Supabase surfaces a connectivity failure as the browser's raw "Failed to
 * fetch", which tells the user nothing actionable.
 */
function readableAuthError(message: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Couldn't reach the sync server. Check your connection and try again."
  }
  return message
}

let synced: SyncedRepository | null = null
let syncedFiles: SyncedFileStore | null = null

export const useSync = create<SyncState>()((set, get) => ({
  configured: isSyncConfigured(),
  account: null,
  status: { phase: 'off', lastSyncedAt: null },
  authBusy: false,
  authError: null,
  notice: null,

  init() {
    if (!get().configured) return
    void (async () => {
      try {
        const supabase = await getSupabase()
        const { data } = await supabase.auth.getSession()
        applySession(data.session?.user ?? null, set, get)
        supabase.auth.onAuthStateChange((_event, session) => {
          applySession(session?.user ?? null, set, get)
        })
      } catch (err) {
        // The app is already running on local data; sync just stays off.
        set({ authError: err instanceof Error ? err.message : 'Could not start sync' })
      }
    })()
  },

  async signIn(email, password) {
    set({ authBusy: true, authError: null, notice: null })
    try {
      const { error } = await (await getSupabase()).auth.signInWithPassword({ email, password })
      set({ authBusy: false, authError: error ? readableAuthError(error.message) : null })
    } catch (err) {
      set({ authBusy: false, authError: readableAuthError(err instanceof Error ? err.message : 'Sign in failed') })
    }
  },

  async signUp(email, password) {
    set({ authBusy: true, authError: null, notice: null })
    let data
    try {
      const result = await (await getSupabase()).auth.signUp({ email, password })
      if (result.error) {
        set({ authBusy: false, authError: readableAuthError(result.error.message) })
        return
      }
      data = result.data
    } catch (err) {
      set({ authBusy: false, authError: readableAuthError(err instanceof Error ? err.message : 'Sign up failed') })
      return
    }
    // With email confirmation on, there is no session until the link is
    // clicked, and nothing else will tell the user that.
    const needsConfirmation = !data.session
    set({
      authBusy: false,
      notice: needsConfirmation ? 'Check your email for a confirmation link, then sign in.' : null,
    })
  },

  async signOut() {
    set({ authBusy: true, authError: null })
    try {
      const { error } = await (await getSupabase()).auth.signOut()
      set({ authBusy: false, authError: error ? readableAuthError(error.message) : null })
    } catch (err) {
      // Sign-out is local-first in supabase-js; the session is gone either way.
      set({ authBusy: false, authError: readableAuthError(err instanceof Error ? err.message : 'Sign out failed') })
    }
  },

  async syncNow() {
    if (!synced) return
    const pulled = await synced.pull().catch(() => null)
    if (pulled) useStore.getState().importData(pulled)
    if (syncedFiles) {
      const pending = await syncedFiles.flushPending()
      set((s) => ({ status: { ...s.status, pendingUploads: pending } }))
    }
  },

  dismissNotice() {
    set({ notice: null })
  },
}))

type Setter = (partial: Partial<SyncState> | ((s: SyncState) => Partial<SyncState>)) => void

function applySession(user: { id: string; email?: string } | null, set: Setter, get: () => SyncState) {
  const current = get().account
  if (user && current?.id === user.id) return
  if (!user && !current) return

  if (!user) {
    stopPublishing()
    synced = null
    syncedFiles = null
    setBackends({ repository: null, fileStore: null })
    set({ account: null, status: { phase: 'off', lastSyncedAt: null } })
    void useStore.getState().hydrate()
    return
  }

  const device = deviceId()
  synced = new SyncedRepository({
    local: localRepository,
    remote: new SupabaseSnapshotStore(user.id),
    meta: new LocalSyncMeta(),
    deviceId: device,
    onStatus: (status) => set((s) => ({ status: { ...status, pendingUploads: s.status.pendingUploads } })),
  })
  syncedFiles = new SyncedFileStore({
    local: localFileStore,
    remote: new SupabaseRemoteFileStore(user.id),
    onPending: (pendingUploads) => set((s) => ({ status: { ...s.status, pendingUploads } })),
  })
  setBackends({ repository: synced, fileStore: syncedFiles })
  watchAndPublish(user.id, (err) => {
    // A failed republish leaves the previous feed in place, which is stale but
    // not broken; surface it in the sync status rather than as an alert.
    if (err) set((s) => ({ status: { ...s.status, message: `Calendar feed: ${err.message}` } }))
  })
  set({ account: { id: user.id, email: user.email ?? null } })
  // Re-read through the synced repository, which reconciles with the server.
  void useStore
    .getState()
    .hydrate()
    .then(() => syncedFiles?.flushPending())
}

/** Pull when the tab comes back, so a device left open notices other devices. */
export function watchForRemoteChanges() {
  if (typeof document === 'undefined') return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void useSync.getState().syncNow()
  })
  window.addEventListener('online', () => void useSync.getState().syncNow())
}
