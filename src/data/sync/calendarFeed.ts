import { buildIcsFeed } from '../../lib/ics'
import { newId } from '../../lib/ids'
import { currentData, useStore } from '../store'
import { getSupabase } from './supabaseClient'

export const CALENDAR_BUCKET = 'notework-calendars'

/** How long to wait after the last edit before republishing. */
const DEBOUNCE_MS = 4000

/**
 * Publishes the user's calendar as a .ics file that iOS/Google Calendar can
 * subscribe to.
 *
 * The file is generated in the browser and uploaded to a public bucket rather
 * than served by a function, which works because the data only ever changes
 * while the app is open — there is no server-side mutation that a
 * browser-generated file could miss. The path carries an unguessable token,
 * the same way every other calendar subscription URL does.
 */
export function feedObjectPath(userId: string, token: string): string {
  return `${userId}/${token}.ics`
}

export function feedUrl(userId: string, token: string): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL
  if (!base) return null
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${CALENDAR_BUCKET}/${feedObjectPath(userId, token)}`
}

/** Mint a token the first time the feed is switched on. */
export function ensureCalendarToken(): string {
  const existing = useStore.getState().settings.calendarToken
  if (existing) return existing
  const token = `${newId()}${newId()}`
  useStore.getState().updateSettings({ calendarToken: token })
  return token
}

/** Build and upload the feed. Throws if the upload fails. */
export async function publishFeed(userId: string, token: string): Promise<{ bytes: number; events: number }> {
  const data = currentData()
  const ics = buildIcsFeed(data.events, {
    name: 'Notework',
    categories: data.categories,
    alarmMinutesBefore: data.settings.calendarAlarmMinutes ?? null,
  })
  const blob = new Blob([ics], { type: 'text/calendar; charset=utf-8' })
  const { error } = await (await getSupabase())
    .storage.from(CALENDAR_BUCKET)
    .upload(feedObjectPath(userId, token), blob, {
      upsert: true,
      contentType: 'text/calendar; charset=utf-8',
      // Calendar clients poll; a short cache keeps them from serving a stale
      // copy for hours after an edit.
      cacheControl: '300',
    })
  if (error) throw new Error(`Could not publish the calendar: ${error.message}`)
  return { bytes: blob.size, events: (ics.match(/BEGIN:VEVENT/g) ?? []).length }
}

/** Remove the published file, e.g. when the feed is switched off. */
export async function unpublishFeed(userId: string, token: string): Promise<void> {
  const { error } = await (await getSupabase()).storage.from(CALENDAR_BUCKET).remove([feedObjectPath(userId, token)])
  if (error && !/not found/i.test(error.message)) {
    throw new Error(`Could not remove the calendar: ${error.message}`)
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
let unsubscribe: (() => void) | null = null

/**
 * Republish whenever the calendar-relevant parts of the store change.
 * Notes, PDFs and annotations don't appear in the feed, so they don't trigger
 * an upload; nor does toggling the feed's own settings, which is handled by
 * the caller.
 */
export function watchAndPublish(userId: string, onResult?: (err: Error | null) => void) {
  stopPublishing()
  unsubscribe = useStore.subscribe((state, prev) => {
    if (!state.hydrated) return
    const relevant = state.events !== prev.events || state.categories !== prev.categories
    if (!relevant) return
    const { calendarFeedEnabled, calendarToken } = state.settings
    if (!calendarFeedEnabled || !calendarToken) return

    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      publishFeed(userId, calendarToken).then(
        () => onResult?.(null),
        (err: unknown) => onResult?.(err instanceof Error ? err : new Error('Publish failed')),
      )
    }, DEBOUNCE_MS)
  })
}

export function stopPublishing() {
  if (timer) clearTimeout(timer)
  timer = null
  unsubscribe?.()
  unsubscribe = null
}
