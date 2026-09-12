import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRepository } from '../localStorageRepository'
import { MemorySyncMeta, SyncedRepository } from './syncedRepository'
import { DEFAULT_SETTINGS, DATA_VERSION, type AppData } from '../../types/models'
import type { RemoteSnapshot, RemoteSnapshotStore, SyncStatus } from './types'

function data(title: string): AppData {
  return {
    version: DATA_VERSION,
    categories: [],
    events: [
      {
        id: 'e1',
        title,
        kind: 'event',
        categoryId: null,
        start: '2026-01-06T09:00:00.000Z',
        end: '2026-01-06T10:00:00.000Z',
        allDay: false,
        linkedNoteIds: [],
        linkedPdfIds: [],
        createdAt: '2026-01-05T09:00:00.000Z',
        updatedAt: '2026-01-05T09:00:00.000Z',
      },
    ],
    folders: [],
    notes: [],
    pdfs: [],
    annotations: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

const titleOf = (d: AppData | null) => d?.events[0]?.title ?? null

/** A remote store that can be made to fail, and records what it was sent. */
class FakeRemote implements RemoteSnapshotStore {
  snapshot: RemoteSnapshot | null = null
  offline = false
  saves = 0
  loads = 0

  async load() {
    this.loads++
    if (this.offline) throw new Error('network down')
    return this.snapshot ? { ...this.snapshot } : null
  }
  async save(d: AppData, updatedAt: string, deviceId: string) {
    if (this.offline) throw new Error('network down')
    this.saves++
    this.snapshot = { data: structuredClone(d), updatedAt, deviceId }
  }
  async clear() {
    if (this.offline) throw new Error('network down')
    this.snapshot = null
  }
}

interface Harness {
  repo: SyncedRepository
  local: MemoryRepository
  remote: FakeRemote
  meta: MemorySyncMeta
  statuses: SyncStatus[]
  setClock(iso: string): void
}

function harness(remote = new FakeRemote(), deviceId = 'device-a'): Harness {
  const local = new MemoryRepository()
  const meta = new MemorySyncMeta()
  const statuses: SyncStatus[] = []
  let clock = '2026-03-01T12:00:00.000Z'
  const repo = new SyncedRepository({
    local,
    remote,
    meta,
    deviceId,
    onStatus: (s) => statuses.push(s),
    now: () => clock,
  })
  return { repo, local, remote, meta, statuses, setClock: (iso) => { clock = iso } }
}

describe('SyncedRepository', () => {
  let remote: FakeRemote
  beforeEach(() => {
    remote = new FakeRemote()
  })

  it('seeds an empty account from this device', async () => {
    const h = harness(remote)
    h.setClock('2026-03-01T12:00:00.000Z')
    await h.repo.save(data('local only'))

    expect(titleOf(remote.snapshot!.data)).toBe('local only')
    expect(remote.snapshot!.deviceId).toBe('device-a')
    expect(titleOf(await h.local.load())).toBe('local only')
  })

  it('takes the account copy on a device that has nothing yet', async () => {
    remote.snapshot = { data: data('from the other device'), updatedAt: '2026-03-01T10:00:00.000Z', deviceId: 'device-b' }
    const h = harness(remote)

    const loaded = await h.repo.load()

    expect(titleOf(loaded)).toBe('from the other device')
    expect(titleOf(await h.local.load())).toBe('from the other device')
    expect(h.meta.read()?.updatedAt).toBe('2026-03-01T10:00:00.000Z')
  })

  it('lets the newer write win when the server is ahead', async () => {
    const h = harness(remote)
    h.setClock('2026-03-01T09:00:00.000Z')
    await h.repo.save(data('mine, older'))
    remote.snapshot = { data: data('theirs, newer'), updatedAt: '2026-03-01T11:00:00.000Z', deviceId: 'device-b' }

    expect(titleOf(await h.repo.load())).toBe('theirs, newer')
    expect(titleOf(await h.local.load())).toBe('theirs, newer')
  })

  it('lets the newer write win when this device is ahead', async () => {
    remote.snapshot = { data: data('theirs, older'), updatedAt: '2026-03-01T08:00:00.000Z', deviceId: 'device-b' }
    const h = harness(remote)
    h.setClock('2026-03-01T12:00:00.000Z')
    await h.repo.save(data('mine, newer'))

    expect(titleOf(await h.repo.load())).toBe('mine, newer')
    expect(titleOf(remote.snapshot.data)).toBe('mine, newer')
  })

  it('compares timestamps as instants, not as strings', async () => {
    const h = harness(remote)
    h.setClock('2026-03-01T12:00:00.000Z')
    await h.repo.save(data('local'))
    // Postgres-style offset notation for the same wall clock, one hour later.
    remote.snapshot = { data: data('remote'), updatedAt: '2026-03-01T14:00:00+01:00', deviceId: 'device-b' }

    expect(titleOf(await h.repo.load())).toBe('remote')
  })

  it('does not push a snapshot straight back after pulling it', async () => {
    remote.snapshot = { data: data('from device B'), updatedAt: '2026-03-01T10:00:00.000Z', deviceId: 'device-b' }
    const h = harness(remote)

    const pulled = await h.repo.load()
    const savesAfterPull = remote.saves

    // The store re-saves whatever hydrate() handed it; that must be a no-op,
    // or two devices would bounce the same snapshot back and forth for ever.
    await h.repo.save(pulled!)

    expect(remote.saves).toBe(savesAfterPull)
    expect(remote.snapshot!.updatedAt).toBe('2026-03-01T10:00:00.000Z')
    expect(remote.snapshot!.deviceId).toBe('device-b')
  })

  it('still pushes a real edit made after a pull', async () => {
    remote.snapshot = { data: data('from device B'), updatedAt: '2026-03-01T10:00:00.000Z', deviceId: 'device-b' }
    const h = harness(remote)
    await h.repo.load()

    h.setClock('2026-03-01T13:00:00.000Z')
    await h.repo.save(data('edited here'))

    expect(titleOf(remote.snapshot!.data)).toBe('edited here')
    expect(remote.snapshot!.deviceId).toBe('device-a')
  })

  it('keeps working offline and reports it', async () => {
    const h = harness(remote)
    h.setClock('2026-03-01T12:00:00.000Z')
    remote.offline = true

    await h.repo.save(data('written while offline'))

    expect(titleOf(await h.local.load())).toBe('written while offline')
    expect(h.statuses.at(-1)?.phase).toBe('offline')
  })

  it('sends an offline edit up on the next successful sync', async () => {
    const h = harness(remote)
    remote.offline = true
    h.setClock('2026-03-01T12:00:00.000Z')
    await h.repo.save(data('written while offline'))

    remote.offline = false
    const loaded = await h.repo.load()

    expect(titleOf(loaded)).toBe('written while offline')
    expect(titleOf(remote.snapshot!.data)).toBe('written while offline')
    expect(h.statuses.at(-1)?.phase).toBe('synced')
  })

  it('falls back to the local copy when the server is unreachable on load', async () => {
    const h = harness(remote)
    h.setClock('2026-03-01T12:00:00.000Z')
    await h.repo.save(data('local'))
    remote.offline = true

    expect(titleOf(await h.repo.load())).toBe('local')
  })

  it('pull() returns nothing when this device is already current', async () => {
    const h = harness(remote)
    h.setClock('2026-03-01T12:00:00.000Z')
    await h.repo.save(data('mine'))

    expect(await h.repo.pull()).toBeNull()
  })

  it('pull() returns the server copy when another device has moved on', async () => {
    const h = harness(remote)
    h.setClock('2026-03-01T12:00:00.000Z')
    await h.repo.save(data('mine'))
    remote.snapshot = { data: data('theirs'), updatedAt: '2026-03-01T13:00:00.000Z', deviceId: 'device-b' }

    const pulled = await h.repo.pull()

    expect(titleOf(pulled)).toBe('theirs')
    expect(titleOf(await h.local.load())).toBe('theirs')
    // And the adopted snapshot still must not bounce back.
    const saves = remote.saves
    await h.repo.save(pulled!)
    expect(remote.saves).toBe(saves)
  })

  it('clear() empties both sides', async () => {
    const h = harness(remote)
    h.setClock('2026-03-01T12:00:00.000Z')
    await h.repo.save(data('mine'))

    await h.repo.clear()

    expect(await h.local.load()).toBeNull()
    expect(remote.snapshot).toBeNull()
    expect(h.meta.read()).toBeNull()
  })

  it('two devices converge on the last write', async () => {
    const a = harness(remote, 'device-a')
    const b = harness(remote, 'device-b')

    a.setClock('2026-03-01T09:00:00.000Z')
    await a.repo.save(data('A at 09:00'))

    b.setClock('2026-03-01T09:30:00.000Z')
    expect(titleOf(await b.repo.load())).toBe('A at 09:00')

    b.setClock('2026-03-01T10:00:00.000Z')
    await b.repo.save(data('B at 10:00'))

    a.setClock('2026-03-01T10:30:00.000Z')
    expect(titleOf(await a.repo.load())).toBe('B at 10:00')
    expect(titleOf(await b.repo.load())).toBe('B at 10:00')
  })

  it('reports a real clock when none is injected', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'))
    try {
      const repo = new SyncedRepository({
        local: new MemoryRepository(),
        remote,
        meta: new MemorySyncMeta(),
        deviceId: 'device-a',
      })
      await repo.save(data('x'))
      expect(remote.snapshot!.updatedAt).toBe('2026-03-01T12:00:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })
})
