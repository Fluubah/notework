import type { AppData } from '../../types/models'

/** The account's copy of the snapshot, as stored remotely. */
export interface RemoteSnapshot {
  data: AppData
  /** ISO timestamp the writing device stamped on it. */
  updatedAt: string
  /** Which device wrote it. Informational; the UI shows it. */
  deviceId: string | null
}

/**
 * The remote half of syncing: one snapshot per account. Kept behind an
 * interface so the sync logic can be tested without a network or a Supabase
 * project, and so another backend can be dropped in later.
 */
export interface RemoteSnapshotStore {
  load(): Promise<RemoteSnapshot | null>
  save(data: AppData, updatedAt: string, deviceId: string): Promise<void>
  clear(): Promise<void>
}

/** The remote half of the file store: PDF blobs, keyed exactly as locally. */
export interface RemoteFileStore {
  upload(key: string, blob: Blob): Promise<void>
  download(key: string): Promise<Blob | undefined>
  remove(key: string): Promise<void>
  clear(): Promise<void>
}

/** When this device's local snapshot was last written, for last-write-wins. */
export interface SyncMetaStore {
  read(): { updatedAt: string } | null
  write(meta: { updatedAt: string }): void
  clear(): void
}

export type SyncPhase =
  /** Not syncing (signed out, or sync isn't configured). */
  | 'off'
  /** Talking to the server right now. */
  | 'syncing'
  /** Local and remote agree as of `lastSyncedAt`. */
  | 'synced'
  /** Server unreachable. Everything still works; changes are saved locally. */
  | 'offline'
  /** The server rejected something — the message says what. */
  | 'error'

export interface SyncStatus {
  phase: SyncPhase
  lastSyncedAt: string | null
  message?: string
  /** PDF uploads that haven't reached the server yet. */
  pendingUploads?: number
}
