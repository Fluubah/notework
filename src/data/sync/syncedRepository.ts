import type { DataRepository } from '../repository'
import type { AppData } from '../../types/models'
import type { RemoteSnapshotStore, SyncMetaStore, SyncStatus } from './types'

export interface SyncedRepositoryOptions {
  /** The on-device copy. Always written first, so the app works offline. */
  local: DataRepository
  remote: RemoteSnapshotStore
  meta: SyncMetaStore
  deviceId: string
  onStatus?: (status: SyncStatus) => void
  /** Injectable for tests. */
  now?: () => string
}

/** Later of two ISO timestamps, compared as instants rather than as strings. */
function isNewer(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b)
}

/**
 * A DataRepository that keeps one account's snapshot in step across devices.
 *
 * The strategy is last-write-wins on the whole snapshot, which is the right
 * shape for the actual use: one person, two or three devices, rarely editing
 * in two places at the same minute. Whoever saved most recently wins; there
 * is no merge and no CRDT.
 *
 * Local always comes first. Every read falls back to the on-device copy and
 * every write lands there before the network is touched, so losing
 * connectivity degrades to exactly the local-only app.
 */
export class SyncedRepository implements DataRepository {
  private local: DataRepository
  private remote: RemoteSnapshotStore
  private meta: SyncMetaStore
  private deviceId: string
  private onStatus: (status: SyncStatus) => void
  private now: () => string
  private lastSyncedAt: string | null = null
  /**
   * The snapshot this device and the server last agreed on. Used to skip the
   * write that a pulled snapshot would otherwise trigger: without it, two
   * devices would push each other's data back and forth for ever.
   */
  private agreedJson: string | null = null

  constructor(opts: SyncedRepositoryOptions) {
    this.local = opts.local
    this.remote = opts.remote
    this.meta = opts.meta
    this.deviceId = opts.deviceId
    this.onStatus = opts.onStatus ?? (() => {})
    this.now = opts.now ?? (() => new Date().toISOString())
  }

  async load(): Promise<AppData | null> {
    const local = await this.local.load()
    const localAt = this.meta.read()?.updatedAt ?? null
    this.report({ phase: 'syncing', lastSyncedAt: this.lastSyncedAt })

    let remote
    try {
      remote = await this.remote.load()
    } catch (err) {
      this.reportOffline(err)
      return local
    }

    // Nothing on the server yet: this device seeds the account.
    if (!remote) {
      if (local) await this.push(local, localAt ?? this.now())
      else this.markSynced(null)
      return local
    }
    // Nothing on this device yet: take the account's copy wholesale.
    if (!local || !localAt) {
      await this.adopt(remote.data, remote.updatedAt)
      return remote.data
    }
    if (isNewer(remote.updatedAt, localAt)) {
      await this.adopt(remote.data, remote.updatedAt)
      return remote.data
    }
    if (isNewer(localAt, remote.updatedAt)) {
      await this.push(local, localAt)
      return local
    }
    // Same instant: already in step.
    this.agreedJson = JSON.stringify(local)
    this.markSynced(localAt)
    return local
  }

  async save(data: AppData): Promise<void> {
    const json = JSON.stringify(data)
    // Nothing new — in particular, this is the write that a just-pulled
    // snapshot provokes as it flows back through the store.
    if (json === this.agreedJson) return

    const at = this.now()
    await this.local.save(data)
    this.meta.write({ updatedAt: at })
    await this.push(data, at, json)
  }

  async clear(): Promise<void> {
    await this.local.clear()
    this.meta.clear()
    this.agreedJson = null
    try {
      await this.remote.clear()
      this.markSynced(null)
    } catch (err) {
      this.reportOffline(err)
    }
  }

  /**
   * Check the server for a newer snapshot, e.g. when the tab regains focus.
   * Returns the data to adopt, or null when this device is already current.
   */
  async pull(): Promise<AppData | null> {
    this.report({ phase: 'syncing', lastSyncedAt: this.lastSyncedAt })
    let remote
    try {
      remote = await this.remote.load()
    } catch (err) {
      this.reportOffline(err)
      return null
    }
    const localAt = this.meta.read()?.updatedAt ?? null
    if (!remote) {
      this.markSynced(localAt)
      return null
    }
    if (localAt && !isNewer(remote.updatedAt, localAt)) {
      this.markSynced(localAt)
      return null
    }
    await this.adopt(remote.data, remote.updatedAt)
    return remote.data
  }

  /** Send this device's copy up, whatever the server currently holds. */
  async pushLocal(): Promise<void> {
    const local = await this.local.load()
    if (!local) return
    const at = this.now()
    this.meta.write({ updatedAt: at })
    await this.push(local, at)
  }

  private async adopt(data: AppData, updatedAt: string): Promise<void> {
    await this.local.save(data)
    this.meta.write({ updatedAt })
    this.agreedJson = JSON.stringify(data)
    this.markSynced(updatedAt)
  }

  private async push(data: AppData, updatedAt: string, json?: string): Promise<void> {
    this.report({ phase: 'syncing', lastSyncedAt: this.lastSyncedAt })
    try {
      await this.remote.save(data, updatedAt, this.deviceId)
      this.agreedJson = json ?? JSON.stringify(data)
      this.markSynced(updatedAt)
    } catch (err) {
      // The local write already succeeded, so nothing is lost: the next
      // successful sync sends it, because local is still the newer copy.
      this.reportOffline(err)
    }
  }

  private markSynced(at: string | null) {
    this.lastSyncedAt = at ?? this.now()
    this.report({ phase: 'synced', lastSyncedAt: this.lastSyncedAt })
  }

  private reportOffline(err: unknown) {
    this.report({
      phase: 'offline',
      lastSyncedAt: this.lastSyncedAt,
      message: err instanceof Error ? err.message : 'Could not reach the server',
    })
  }

  private report(status: SyncStatus) {
    this.onStatus(status)
  }
}

/** Local-storage backed sync metadata. */
export class LocalSyncMeta implements SyncMetaStore {
  private key: string
  constructor(key = 'notework:sync:v1') {
    this.key = key
  }
  read() {
    try {
      const raw = localStorage.getItem(this.key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { updatedAt?: unknown }
      return typeof parsed.updatedAt === 'string' ? { updatedAt: parsed.updatedAt } : null
    } catch {
      return null
    }
  }
  write(meta: { updatedAt: string }) {
    try {
      localStorage.setItem(this.key, JSON.stringify(meta))
    } catch {
      /* storage may be unavailable; sync degrades to pushing on every save */
    }
  }
  clear() {
    try {
      localStorage.removeItem(this.key)
    } catch {
      /* nothing to do */
    }
  }
}

/** In-memory sync metadata, for tests. */
export class MemorySyncMeta implements SyncMetaStore {
  private meta: { updatedAt: string } | null = null
  read() {
    return this.meta
  }
  write(meta: { updatedAt: string }) {
    this.meta = { ...meta }
  }
  clear() {
    this.meta = null
  }
}
