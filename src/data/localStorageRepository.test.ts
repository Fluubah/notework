import { describe, expect, it } from 'vitest'
import { emptyAppData } from '../types/models'
import { LocalStorageRepository, migrate } from './localStorageRepository'

describe('LocalStorageRepository', () => {
  it('round-trips data', async () => {
    const repo = new LocalStorageRepository(window.localStorage, 'test:key')
    expect(await repo.load()).toBeNull()
    const data = emptyAppData()
    data.categories.push({ id: 'c', name: 'Math', color: '#123456', createdAt: 'x', sortOrder: 0 })
    await repo.save(data)
    const loaded = await repo.load()
    expect(loaded?.categories[0].name).toBe('Math')
    await repo.clear()
    expect(await repo.load()).toBeNull()
  })
  it('survives corrupt JSON', async () => {
    window.localStorage.setItem('bad', '{not json')
    const repo = new LocalStorageRepository(window.localStorage, 'bad')
    expect(await repo.load()).toBeNull()
  })
  it('migrates missing fields', () => {
    const out = migrate({ version: 0, events: [{ id: 'e', title: 't' }] })
    expect(out?.events[0].linkedNoteIds).toEqual([])
    expect(out?.settings.weekStartsOn).toBe(1)
  })
})
