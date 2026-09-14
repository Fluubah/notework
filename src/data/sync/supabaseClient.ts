import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Sync is opt-in at build time: without these two variables the app is
 * exactly the local-only app it was before, the sync UI stays hidden, and
 * the client below is never imported — so a local-only build doesn't ship
 * supabase-js at all.
 *
 * The publishable key (Supabase's `sb_publishable_…`, formerly the "anon"
 * key) is meant to be shipped in the browser. Row-level security, not
 * secrecy, is what keeps one account's data away from another's; see
 * schema.sql. The *secret* key must never appear here.
 */
export function isSyncConfigured(): boolean {
  return Boolean(url && publishableKey)
}

let clientPromise: Promise<SupabaseClient> | null = null

/**
 * The client is ~200KB, and the app hydrates from local storage first, so it
 * is loaded on demand rather than in the entry chunk — the same reason pdf.js
 * is deferred.
 */
export function getSupabase(): Promise<SupabaseClient> {
  if (!url || !publishableKey) {
    return Promise.reject(new Error('Sync is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'))
  }
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Sessions are per-origin anyway; a named key keeps it obvious in devtools.
        storageKey: 'notework:auth:v1',
      },
    }),
  )
  return clientPromise
}
