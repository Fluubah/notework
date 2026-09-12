import type { AppData } from '../types/models'

/**
 * The single seam between the app and wherever data lives.
 *
 * The store talks *only* to these two interfaces. Swapping localStorage for
 * a REST/Supabase/whatever backend means implementing them and changing the
 * one call site in `src/data/index.ts`.
 */
export interface DataRepository {
  /** Load the persisted snapshot, or null on first run. */
  load(): Promise<AppData | null>
  /** Persist a full snapshot. Implementations may debounce/diff internally. */
  save(data: AppData): Promise<void>
  /** Wipe everything (used by "Reset data"). */
  clear(): Promise<void>
}

/** Binary blobs (PDF files) are stored separately from the JSON snapshot. */
export interface FileStore {
  put(key: string, blob: Blob): Promise<void>
  get(key: string): Promise<Blob | undefined>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}
