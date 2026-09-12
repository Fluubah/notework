import { migrate } from '../localStorageRepository'
import { getSupabase } from './supabaseClient'
import type { RemoteFileStore, RemoteSnapshot, RemoteSnapshotStore } from './types'
import type { AppData } from '../../types/models'

export const SNAPSHOT_TABLE = 'notework_snapshots'
export const FILE_BUCKET = 'notework-files'

/**
 * Storage object keys are restricted to a conservative character set. The
 * app's own keys look like `pdf:<nanoid>`, and nanoid's alphabet is already
 * within that set, so only the colon is rewritten — the mapping stays
 * one-to-one for every key the app generates.
 */
function objectPath(userId: string, key: string): string {
  return `${userId}/${key.replace(/[^A-Za-z0-9._-]/g, '-')}`
}

/** One row per account, holding the whole snapshot. */
export class SupabaseSnapshotStore implements RemoteSnapshotStore {
  private userId: string
  constructor(userId: string) {
    this.userId = userId
  }

  async load(): Promise<RemoteSnapshot | null> {
    const { data, error } = await (await getSupabase())
      .from(SNAPSHOT_TABLE)
      .select('data, updated_at, device_id')
      .eq('user_id', this.userId)
      .maybeSingle()
    if (error) throw new Error(`Could not read your synced data: ${error.message}`)
    if (!data) return null

    const migrated = migrate(data.data)
    if (!migrated) throw new Error('The synced snapshot is not readable by this version.')
    return {
      data: migrated,
      // Postgres returns its own timestamp format; normalise so both sides
      // are comparable as instants.
      updatedAt: new Date(data.updated_at as string).toISOString(),
      deviceId: (data.device_id as string | null) ?? null,
    }
  }

  async save(data: AppData, updatedAt: string, deviceId: string): Promise<void> {
    const { error } = await (await getSupabase())
      .from(SNAPSHOT_TABLE)
      .upsert({ user_id: this.userId, data, updated_at: updatedAt, device_id: deviceId }, { onConflict: 'user_id' })
    if (error) throw new Error(`Could not save to the server: ${error.message}`)
  }

  async clear(): Promise<void> {
    const { error } = await (await getSupabase()).from(SNAPSHOT_TABLE).delete().eq('user_id', this.userId)
    if (error) throw new Error(`Could not clear your synced data: ${error.message}`)
  }
}

/** PDF blobs in a private storage bucket, one folder per account. */
export class SupabaseRemoteFileStore implements RemoteFileStore {
  private userId: string
  constructor(userId: string) {
    this.userId = userId
  }

  async upload(key: string, blob: Blob): Promise<void> {
    const { error } = await (await getSupabase())
      .storage.from(FILE_BUCKET)
      .upload(objectPath(this.userId, key), blob, { upsert: true, contentType: blob.type || 'application/pdf' })
    if (error) throw new Error(`Could not upload the PDF: ${error.message}`)
  }

  async download(key: string): Promise<Blob | undefined> {
    const { data, error } = await (await getSupabase()).storage.from(FILE_BUCKET).download(objectPath(this.userId, key))
    if (error) {
      // A file that isn't there is a normal answer, not a failure: the
      // snapshot may mention a PDF whose upload never completed.
      if (isNotFound(error)) return undefined
      throw new Error(`Could not download the PDF: ${error.message}`)
    }
    return data ?? undefined
  }

  async remove(key: string): Promise<void> {
    const { error } = await (await getSupabase()).storage.from(FILE_BUCKET).remove([objectPath(this.userId, key)])
    if (error && !isNotFound(error)) throw new Error(`Could not remove the PDF: ${error.message}`)
  }

  async clear(): Promise<void> {
    const supabase = await getSupabase()
    const { data, error } = await supabase.storage.from(FILE_BUCKET).list(this.userId, { limit: 1000 })
    if (error) throw new Error(`Could not list your files: ${error.message}`)
    if (!data?.length) return
    const { error: removeError } = await supabase.storage.from(FILE_BUCKET).remove(data.map((f) => `${this.userId}/${f.name}`))
    if (removeError) throw new Error(`Could not remove your files: ${removeError.message}`)
  }
}

function isNotFound(error: { message?: string; status?: number }): boolean {
  return error.status === 404 || /not found|does not exist/i.test(error.message ?? '')
}
