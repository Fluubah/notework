import { DATA_VERSION, DEFAULT_SETTINGS, type AppData } from '../types/models'
import type { DataRepository } from './repository'

const STORAGE_KEY = 'notework:data:v1'

/**
 * Migrate older snapshots forward. Each case falls through to the next so a
 * very old snapshot is upgraded step by step.
 */
export function migrate(raw: unknown): AppData | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<AppData>
  const version = typeof data.version === 'number' ? data.version : 0
  const out: AppData = {
    version: DATA_VERSION,
    categories: data.categories ?? [],
    events: (data.events ?? []).map((e) => ({
      ...e,
      linkedNoteIds: e.linkedNoteIds ?? [],
      linkedPdfIds: e.linkedPdfIds ?? [],
    })),
    folders: data.folders ?? [],
    notes: data.notes ?? [],
    pdfs: data.pdfs ?? [],
    annotations: data.annotations ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
  }
  if (version > DATA_VERSION) {
    console.warn(`Data version ${version} is newer than this app (${DATA_VERSION}); loading anyway.`)
  }
  return out
}

export class LocalStorageRepository implements DataRepository {
  private readonly storage: Storage
  private readonly key: string
  constructor(storage: Storage = window.localStorage, key = STORAGE_KEY) {
    this.storage = storage
    this.key = key
  }

  async load(): Promise<AppData | null> {
    const raw = this.storage.getItem(this.key)
    if (!raw) return null
    try {
      return migrate(JSON.parse(raw))
    } catch (err) {
      console.error('Failed to parse saved data; starting fresh.', err)
      return null
    }
  }

  async save(data: AppData): Promise<void> {
    this.storage.setItem(this.key, JSON.stringify(data))
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.key)
  }
}

/** In-memory repository for tests and SSR-ish contexts. */
export class MemoryRepository implements DataRepository {
  private snapshot: AppData | null = null
  async load() {
    return this.snapshot ? structuredClone(this.snapshot) : null
  }
  async save(data: AppData) {
    this.snapshot = structuredClone(data)
  }
  async clear() {
    this.snapshot = null
  }
}
