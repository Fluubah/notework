import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryFileStore } from '../fileStore'
import { SyncedFileStore } from './syncedFileStore'
import type { RemoteFileStore } from './types'

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0x00])

function pdf(byte = 0x41) {
  return new Blob([new Uint8Array([...BYTES, byte])], { type: 'application/pdf' })
}
async function bytes(blob: Blob | undefined) {
  return blob ? [...new Uint8Array(await blob.arrayBuffer())] : undefined
}

class FakeRemoteFiles implements RemoteFileStore {
  files = new Map<string, Blob>()
  offline = false

  async upload(key: string, blob: Blob) {
    if (this.offline) throw new Error('network down')
    this.files.set(key, blob)
  }
  async download(key: string) {
    if (this.offline) throw new Error('network down')
    return this.files.get(key)
  }
  async remove(key: string) {
    if (this.offline) throw new Error('network down')
    this.files.delete(key)
  }
  async clear() {
    if (this.offline) throw new Error('network down')
    this.files.clear()
  }
}

describe('SyncedFileStore', () => {
  let remote: FakeRemoteFiles
  let local: MemoryFileStore
  let store: SyncedFileStore

  beforeEach(() => {
    localStorage.clear()
    remote = new FakeRemoteFiles()
    local = new MemoryFileStore()
    store = new SyncedFileStore({ local, remote })
  })

  it('writes to this device and uploads', async () => {
    await store.put('pdf:a', pdf())

    expect(await bytes(await local.get('pdf:a'))).toEqual(await bytes(pdf()))
    expect(remote.files.has('pdf:a')).toBe(true)
    expect(store.pendingCount()).toBe(0)
  })

  it('downloads and caches a file this device has never seen', async () => {
    remote.files.set('pdf:b', pdf(0x42))

    expect(await bytes(await store.get('pdf:b'))).toEqual(await bytes(pdf(0x42)))
    // Cached, so the next read needs no network.
    remote.offline = true
    expect(await bytes(await store.get('pdf:b'))).toEqual(await bytes(pdf(0x42)))
  })

  it('serves a cached file without touching the network', async () => {
    await store.put('pdf:a', pdf())
    remote.offline = true

    expect(await bytes(await store.get('pdf:a'))).toEqual(await bytes(pdf()))
  })

  it('returns nothing for a file that is neither cached nor reachable', async () => {
    remote.offline = true
    expect(await store.get('pdf:missing')).toBeUndefined()
  })

  it('remembers an upload that failed and retries it later', async () => {
    remote.offline = true
    await store.put('pdf:a', pdf())

    expect(await local.get('pdf:a')).toBeDefined()
    expect(remote.files.has('pdf:a')).toBe(false)
    expect(store.pendingCount()).toBe(1)

    remote.offline = false
    expect(await store.flushPending()).toBe(0)
    expect(await bytes(remote.files.get('pdf:a'))).toEqual(await bytes(pdf()))
  })

  it('keeps the upload pending while still offline', async () => {
    remote.offline = true
    await store.put('pdf:a', pdf())

    expect(await store.flushPending()).toBe(1)
    expect(store.pendingCount()).toBe(1)
  })

  it('drops a pending upload for a file that was deleted since', async () => {
    remote.offline = true
    await store.put('pdf:a', pdf())
    await store.delete('pdf:a')

    remote.offline = false
    expect(await store.flushPending()).toBe(0)
    expect(remote.files.has('pdf:a')).toBe(false)
  })

  it('deletes from both sides', async () => {
    await store.put('pdf:a', pdf())
    await store.delete('pdf:a')

    expect(await local.get('pdf:a')).toBeUndefined()
    expect(remote.files.has('pdf:a')).toBe(false)
  })

  it('clears both sides', async () => {
    await store.put('pdf:a', pdf())
    await store.put('pdf:b', pdf(0x42))

    await store.clear()

    expect(await local.get('pdf:a')).toBeUndefined()
    expect(remote.files.size).toBe(0)
    expect(store.pendingCount()).toBe(0)
  })

  it('survives a delete while offline without losing the local delete', async () => {
    await store.put('pdf:a', pdf())
    remote.offline = true

    await store.delete('pdf:a')

    expect(await local.get('pdf:a')).toBeUndefined()
  })

  it('carries pending uploads across a restart', async () => {
    remote.offline = true
    await store.put('pdf:a', pdf())

    // A new session, same browser storage and same local cache.
    const restarted = new SyncedFileStore({ local, remote })
    expect(restarted.pendingCount()).toBe(1)

    remote.offline = false
    expect(await restarted.flushPending()).toBe(0)
    expect(remote.files.has('pdf:a')).toBe(true)
  })
})
