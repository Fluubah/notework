import type { FileStore } from '../repository'
import type { RemoteFileStore } from './types'

export interface SyncedFileStoreOptions {
  local: FileStore
  remote: RemoteFileStore
  /** Notified when the pending-upload count changes. */
  onPending?: (count: number) => void
  /** Where the pending list is kept between sessions. */
  pendingKey?: string
}

/**
 * A FileStore that keeps PDF blobs on this device and in the account's
 * storage bucket.
 *
 * Reads are local-first and fall back to a download, so a device that pulls a
 * snapshot mentioning a PDF it has never seen fetches the file on demand
 * rather than up front. Uploads that fail are remembered and retried, since a
 * silently dropped upload would leave the PDF stranded on one device.
 */
export class SyncedFileStore implements FileStore {
  private local: FileStore
  private remote: RemoteFileStore
  private onPending: (count: number) => void
  private pendingKey: string

  constructor(opts: SyncedFileStoreOptions) {
    this.local = opts.local
    this.remote = opts.remote
    this.onPending = opts.onPending ?? (() => {})
    this.pendingKey = opts.pendingKey ?? 'notework:sync:pending-files:v1'
  }

  async put(key: string, blob: Blob): Promise<void> {
    await this.local.put(key, blob)
    try {
      await this.remote.upload(key, blob)
      this.setPending(this.pending().filter((k) => k !== key))
    } catch {
      this.setPending([...new Set([...this.pending(), key])])
    }
  }

  async get(key: string): Promise<Blob | undefined> {
    const cached = await this.local.get(key)
    if (cached) return cached
    try {
      const blob = await this.remote.download(key)
      if (blob) await this.local.put(key, blob)
      return blob
    } catch {
      // Offline and not cached: the viewer reports that it can't open the file.
      return undefined
    }
  }

  async delete(key: string): Promise<void> {
    await this.local.delete(key)
    this.setPending(this.pending().filter((k) => k !== key))
    try {
      await this.remote.remove(key)
    } catch {
      /* the row is gone locally; a stray remote object is harmless */
    }
  }

  async clear(): Promise<void> {
    await this.local.clear()
    this.setPending([])
    try {
      await this.remote.clear()
    } catch {
      /* see delete() */
    }
  }

  /** Retry uploads that failed earlier. Returns how many are still pending. */
  async flushPending(): Promise<number> {
    for (const key of this.pending()) {
      const blob = await this.local.get(key)
      if (!blob) {
        // Deleted since; nothing left to upload.
        this.setPending(this.pending().filter((k) => k !== key))
        continue
      }
      try {
        await this.remote.upload(key, blob)
        this.setPending(this.pending().filter((k) => k !== key))
      } catch {
        break // still offline; try again next time
      }
    }
    return this.pending().length
  }

  pendingCount(): number {
    return this.pending().length
  }

  private pending(): string[] {
    try {
      const raw = localStorage.getItem(this.pendingKey)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
    } catch {
      return []
    }
  }

  private setPending(keys: string[]) {
    try {
      if (keys.length) localStorage.setItem(this.pendingKey, JSON.stringify(keys))
      else localStorage.removeItem(this.pendingKey)
    } catch {
      /* storage unavailable; retries are best-effort */
    }
    this.onPending(keys.length)
  }
}
