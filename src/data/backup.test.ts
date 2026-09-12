import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, backupFilename, createBackup, parseBackup, restoreBackup } from './backup'
import { MemoryFileStore } from './fileStore'
import { DATA_VERSION, DEFAULT_SETTINGS, type AppData } from '../types/models'

/** Every byte value, so a base64 or latin-1 slip shows up as a mismatch. */
const PDF_BYTES = new Uint8Array(Array.from({ length: 256 }, (_, i) => i))
const OTHER_BYTES = new Uint8Array([0xff, 0x00, 0x7f, 0x80, 0x01])

function sampleData(): AppData {
  return {
    version: DATA_VERSION,
    categories: [{ id: 'c1', name: 'Linear Algebra', color: '#4f6df5', code: 'MATH 221', createdAt: '2026-01-05T09:00:00.000Z', sortOrder: 0 }],
    events: [
      {
        id: 'e1',
        title: 'Lecture',
        kind: 'class',
        categoryId: 'c1',
        start: '2026-01-06T09:00:00.000Z',
        end: '2026-01-06T10:00:00.000Z',
        allDay: false,
        location: 'Room 204',
        recurrence: { freq: 'weekly', interval: 1, byWeekday: [2] },
        exdates: ['2026-02-10T09:00:00.000Z'],
        overrides: { '2026-01-13T09:00:00.000Z': { title: 'Guest lecture', completed: false } },
        linkedNoteIds: ['n1'],
        linkedPdfIds: ['p1'],
        createdAt: '2026-01-05T09:00:00.000Z',
        updatedAt: '2026-01-05T09:00:00.000Z',
      },
      {
        id: 'e2',
        title: 'Problem set 3',
        kind: 'assignment',
        categoryId: 'c1',
        start: '2026-01-20T23:59:00.000Z',
        end: '2026-01-20T23:59:00.000Z',
        allDay: false,
        completed: true,
        priority: 'high',
        linkedNoteIds: [],
        linkedPdfIds: [],
        createdAt: '2026-01-05T09:00:00.000Z',
        updatedAt: '2026-01-06T09:00:00.000Z',
      },
    ],
    folders: [{ id: 'f1', name: 'Week 1', categoryId: 'c1', createdAt: '2026-01-05T09:00:00.000Z', sortOrder: 0 }],
    notes: [
      {
        id: 'n1',
        title: 'Eigenvalues',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'det(A - λI) = 0' }] }] },
        excerpt: 'det(A - λI) = 0',
        categoryId: 'c1',
        folderId: 'f1',
        pinned: true,
        createdAt: '2026-01-05T09:00:00.000Z',
        updatedAt: '2026-01-05T09:00:00.000Z',
      },
    ],
    pdfs: [
      { id: 'p1', name: 'Lecture 1', categoryId: 'c1', folderId: 'f1', size: 256, pageCount: 12, fileKey: 'pdf:aaa', createdAt: '2026-01-05T09:00:00.000Z', updatedAt: '2026-01-05T09:00:00.000Z', lastPage: 4 },
      { id: 'p2', name: 'Syllabus', categoryId: null, folderId: null, size: 5, pageCount: 2, fileKey: 'pdf:bbb', createdAt: '2026-01-05T09:00:00.000Z', updatedAt: '2026-01-05T09:00:00.000Z' },
    ],
    annotations: [
      { id: 'a1', pdfId: 'p1', page: 1, type: 'ink', color: '#ff3b30', width: 2, strokes: [[{ x: 10, y: 20 }, { x: 30, y: 40 }], [{ x: 5, y: 6 }]], createdAt: '2026-01-06T09:00:00.000Z' },
      { id: 'a2', pdfId: 'p1', page: 2, type: 'highlight', color: '#ffe83b', width: 12, strokes: [[{ x: 1, y: 2 }, { x: 3, y: 4 }]], createdAt: '2026-01-06T09:00:00.000Z' },
      { id: 'a3', pdfId: 'p1', page: 2, type: 'text', color: '#111318', x: 5, y: 6, w: 120, fontSize: 12, text: 'check this', createdAt: '2026-01-06T09:00:00.000Z' },
      { id: 'a4', pdfId: 'p2', page: 1, type: 'sticky', color: '#ffe83b', x: 7, y: 8, text: 'office hours', createdAt: '2026-01-06T09:00:00.000Z' },
    ],
    settings: { ...DEFAULT_SETTINGS, theme: 'dark', weekStartsOn: 0, dayStartHour: 7, showCompleted: false },
  }
}

async function seededStore() {
  const files = new MemoryFileStore()
  await files.put('pdf:aaa', new Blob([PDF_BYTES], { type: 'application/pdf' }))
  await files.put('pdf:bbb', new Blob([OTHER_BYTES], { type: 'application/pdf' }))
  return files
}

async function bytesOf(files: MemoryFileStore, key: string) {
  const blob = await files.get(key)
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined
}

/** Export to a string and read it back, exactly as the Settings buttons do. */
async function roundTrip(data: AppData, files: MemoryFileStore) {
  const text = JSON.stringify(await createBackup(data, files))
  return parseBackup(text)
}

describe('backup round trip', () => {
  it('restores every slice of the snapshot unchanged', async () => {
    const data = sampleData()
    const restored = await roundTrip(data, await seededStore())
    expect(restored.data).toEqual(data)
  })

  it('restores PDF bytes exactly into an empty file store', async () => {
    const backup = await roundTrip(sampleData(), await seededStore())
    const target = new MemoryFileStore()

    await restoreBackup(backup, target, { ...sampleData(), pdfs: [] })

    expect(await bytesOf(target, 'pdf:aaa')).toEqual(PDF_BYTES)
    expect(await bytesOf(target, 'pdf:bbb')).toEqual(OTHER_BYTES)
    expect((await target.get('pdf:aaa'))!.type).toBe('application/pdf')
  })

  it('survives a full export/restore cycle onto a fresh device', async () => {
    const data = sampleData()
    const source = await seededStore()
    const backup = await roundTrip(data, source)

    // A fresh install: no data, no files.
    const target = new MemoryFileStore()
    const restored = await restoreBackup(backup, target, {
      version: DATA_VERSION,
      categories: [],
      events: [],
      folders: [],
      notes: [],
      pdfs: [],
      annotations: [],
      settings: { ...DEFAULT_SETTINGS },
    })

    expect(restored).toEqual(data)
    for (const pdf of data.pdfs) {
      expect(await bytesOf(target, pdf.fileKey)).toEqual(await bytesOf(source, pdf.fileKey))
    }
  })

  it('drops blobs belonging to the data it replaced', async () => {
    const files = await seededStore()
    await files.put('pdf:stale', new Blob([OTHER_BYTES]))
    const previous: AppData = { ...sampleData(), pdfs: [{ ...sampleData().pdfs[0], id: 'old', fileKey: 'pdf:stale' }] }

    const backup = await roundTrip(sampleData(), files)
    await restoreBackup(backup, files, previous)

    expect(await files.get('pdf:stale')).toBeUndefined()
    expect(await files.get('pdf:aaa')).toBeDefined()
  })

  it('skips a PDF whose blob is already missing instead of failing', async () => {
    const files = new MemoryFileStore()
    await files.put('pdf:aaa', new Blob([PDF_BYTES]))

    const backup = await createBackup(sampleData(), files)

    expect(Object.keys(backup.files)).toEqual(['pdf:aaa'])
    expect(backup.data.pdfs).toHaveLength(2)
  })

  it('reads a bare snapshot from an older export', async () => {
    const data = sampleData()
    const backup = parseBackup(JSON.stringify(data))
    expect(backup.data).toEqual(data)
    expect(backup.files).toEqual({})
  })

  it('stamps the current format on what it writes', async () => {
    const backup = await createBackup(sampleData(), await seededStore())
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.backupVersion).toBe(1)
    expect(Date.parse(backup.exportedAt)).not.toBeNaN()
  })

  it('rejects files that are not backups', async () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/)
    expect(() => parseBackup('[1,2,3]')).toThrow(/Notework backup/)
    expect(() => parseBackup('null')).toThrow(/Notework backup/)
  })

  it('names the download by date', () => {
    expect(backupFilename(new Date('2026-09-12T18:30:00.000Z'))).toBe('notework-backup-2026-09-12.json')
  })
})
