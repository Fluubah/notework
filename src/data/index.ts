import { IndexedDbFileStore, MemoryFileStore } from './fileStore'
import { LocalStorageRepository, MemoryRepository } from './localStorageRepository'
import type { DataRepository, FileStore } from './repository'

/**
 * The one place that decides which backend the app uses.
 * To move to a server, implement `DataRepository`/`FileStore` and swap here.
 */
const hasBrowserStorage = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
const hasIndexedDb = typeof indexedDB !== 'undefined'

export const repository: DataRepository = hasBrowserStorage ? new LocalStorageRepository() : new MemoryRepository()
export const fileStore: FileStore = hasIndexedDb ? new IndexedDbFileStore() : new MemoryFileStore()

export type { DataRepository, FileStore } from './repository'
