import type { FileStore } from './repository'

const DB_NAME = 'notework-files'
const STORE = 'files'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** IndexedDB-backed blob store. Files can be tens of MB; localStorage can't hold them. */
export class IndexedDbFileStore implements FileStore {
  private dbPromise: Promise<IDBDatabase> | null = null
  private db() {
    this.dbPromise ??= openDb()
    return this.dbPromise
  }
  async put(key: string, blob: Blob) {
    await tx(await this.db(), 'readwrite', (s) => s.put(blob, key))
  }
  async get(key: string) {
    return (await tx<Blob | undefined>(await this.db(), 'readonly', (s) => s.get(key))) ?? undefined
  }
  async delete(key: string) {
    await tx(await this.db(), 'readwrite', (s) => s.delete(key))
  }
  async clear() {
    await tx(await this.db(), 'readwrite', (s) => s.clear())
  }
}

export class MemoryFileStore implements FileStore {
  private map = new Map<string, Blob>()
  async put(key: string, blob: Blob) {
    this.map.set(key, blob)
  }
  async get(key: string) {
    return this.map.get(key)
  }
  async delete(key: string) {
    this.map.delete(key)
  }
  async clear() {
    this.map.clear()
  }
}
