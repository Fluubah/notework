import { migrate } from './localStorageRepository'
import type { FileStore } from './repository'
import type { AppData } from '../types/models'

export const BACKUP_FORMAT = 'notework-backup'
export const BACKUP_VERSION = 1

/** One PDF's bytes, base64 so the whole backup fits in a single JSON file. */
export interface BackupFileEntry {
  type: string
  data: string
}

/**
 * A complete, portable copy of everything the app holds: the JSON snapshot
 * (categories, events, notes, PDF metadata, annotations, settings) plus the
 * PDF blobs, which live in IndexedDB rather than in the snapshot. A backup
 * without them would restore to a library of PDFs that cannot be opened.
 */
export interface BackupFile {
  format: typeof BACKUP_FORMAT
  backupVersion: number
  exportedAt: string
  data: AppData
  files: Record<string, BackupFileEntry>
}

// Chunked so a large PDF doesn't blow the argument limit of String.fromCharCode.
const CHUNK = 0x8000

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** Bundle a snapshot with every PDF blob it references. */
export async function createBackup(data: AppData, files: FileStore): Promise<BackupFile> {
  const entries: Record<string, BackupFileEntry> = {}
  for (const key of referencedFileKeys(data)) {
    const blob = await files.get(key)
    // A missing blob is survivable — the PDF was already broken — so skip it
    // rather than failing the whole backup.
    if (!blob) continue
    entries[key] = {
      type: blob.type || 'application/pdf',
      data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
    }
  }
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    files: entries,
  }
}

/**
 * Read a backup file's text. Accepts both the current wrapper format and a
 * bare `AppData` snapshot, which is what older versions of the app exported.
 * Throws with a readable message if the text isn't a backup at all.
 */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('That file does not look like a Notework backup.')
  }

  const obj = raw as Partial<BackupFile>
  const isWrapped = obj.format === BACKUP_FORMAT
  const data = migrate(isWrapped ? obj.data : raw)
  if (!data) throw new Error('That file does not look like a Notework backup.')
  if (isWrapped && typeof obj.backupVersion === 'number' && obj.backupVersion > BACKUP_VERSION) {
    console.warn(`Backup version ${obj.backupVersion} is newer than this app (${BACKUP_VERSION}); restoring anyway.`)
  }

  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    exportedAt: (isWrapped && typeof obj.exportedAt === 'string' ? obj.exportedAt : null) ?? new Date().toISOString(),
    data,
    files: isWrapped ? validFiles(obj.files) : {},
  }
}

/**
 * Write the backup's PDF blobs into the file store and return the snapshot to
 * hand to the store. Blobs are written *before* the caller swaps the data over,
 * so a failure mid-restore leaves the existing data intact. Blobs belonging to
 * the replaced data are then dropped, since nothing can reach them any more.
 */
export async function restoreBackup(backup: BackupFile, files: FileStore, previous: AppData): Promise<AppData> {
  for (const [key, entry] of Object.entries(backup.files)) {
    const bytes = base64ToBytes(entry.data)
    await files.put(key, new Blob([bytes], { type: entry.type || 'application/pdf' }))
  }

  const keep = referencedFileKeys(backup.data)
  for (const key of referencedFileKeys(previous)) {
    if (!keep.has(key)) await files.delete(key)
  }
  return backup.data
}

export function backupFilename(now = new Date()): string {
  return `notework-backup-${now.toISOString().slice(0, 10)}.json`
}

function referencedFileKeys(data: AppData): Set<string> {
  return new Set(data.pdfs.map((p) => p.fileKey).filter((k): k is string => typeof k === 'string' && k.length > 0))
}

function validFiles(files: unknown): Record<string, BackupFileEntry> {
  if (!files || typeof files !== 'object') return {}
  const out: Record<string, BackupFileEntry> = {}
  for (const [key, value] of Object.entries(files as Record<string, unknown>)) {
    const entry = value as Partial<BackupFileEntry>
    if (entry && typeof entry.data === 'string') {
      out[key] = { type: typeof entry.type === 'string' ? entry.type : 'application/pdf', data: entry.data }
    }
  }
  return out
}
