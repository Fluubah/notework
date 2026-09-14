import { IndexedDbFileStore, MemoryFileStore } from './fileStore'
import { LocalStorageRepository, MemoryRepository } from './localStorageRepository'
import type { DataRepository, FileStore } from './repository'

/**
 * The one place that decides which backend the app uses.
 *
 * The local backends are the default and the fallback: everything works with
 * no account and no network. Signing in swaps in the synced backends (see
 * `data/sync`), which wrap these same local ones — so `repository` and
 * `fileStore` are stable references that delegate to whichever backend is
 * active, and nothing else in the app has to know that sync exists.
 */
const hasBrowserStorage = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
const hasIndexedDb = typeof indexedDB !== 'undefined'

export const localRepository: DataRepository = hasBrowserStorage ? new LocalStorageRepository() : new MemoryRepository()
export const localFileStore: FileStore = hasIndexedDb ? new IndexedDbFileStore() : new MemoryFileStore()

let activeRepository: DataRepository = localRepository
let activeFileStore: FileStore = localFileStore

export const repository: DataRepository = {
  load: () => activeRepository.load(),
  save: (data) => activeRepository.save(data),
  clear: () => activeRepository.clear(),
}

export const fileStore: FileStore = {
  put: (key, blob) => activeFileStore.put(key, blob),
  get: (key) => activeFileStore.get(key),
  delete: (key) => activeFileStore.delete(key),
  clear: () => activeFileStore.clear(),
}

/** Swap in a backend (used when signing in), or pass null to go local-only. */
export function setBackends(next: { repository?: DataRepository | null; fileStore?: FileStore | null }) {
  if (next.repository !== undefined) activeRepository = next.repository ?? localRepository
  if (next.fileStore !== undefined) activeFileStore = next.fileStore ?? localFileStore
}

export type { DataRepository, FileStore } from './repository'
