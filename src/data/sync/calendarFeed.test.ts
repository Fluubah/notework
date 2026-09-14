import { beforeEach, describe, expect, it } from 'vitest'
import { CALENDAR_BUCKET, feedObjectPath, feedUrl } from './calendarFeed'

describe('feed object path', () => {
  it('puts the file in the account folder the storage policy checks', () => {
    // The write policy keys off the first path segment being the user id;
    // changing this shape silently breaks publishing for everyone.
    expect(feedObjectPath('user-123', 'tok')).toBe('user-123/tok.ics')
    expect(feedObjectPath('user-123', 'tok').split('/')[0]).toBe('user-123')
  })
  it('ends in .ics so clients sniff the right type', () => {
    expect(feedObjectPath('u', 't').endsWith('.ics')).toBe(true)
  })
})

describe('feed url', () => {
  const ORIGINAL = import.meta.env.VITE_SUPABASE_URL

  beforeEach(() => {
    import.meta.env.VITE_SUPABASE_URL = ORIGINAL
  })

  it('is null when sync is not configured', () => {
    import.meta.env.VITE_SUPABASE_URL = ''
    expect(feedUrl('u', 't')).toBeNull()
  })

  it('points at the public storage endpoint', () => {
    import.meta.env.VITE_SUPABASE_URL = 'https://abc.supabase.co'
    expect(feedUrl('user-1', 'tok')).toBe(`https://abc.supabase.co/storage/v1/object/public/${CALENDAR_BUCKET}/user-1/tok.ics`)
  })

  it('tolerates a trailing slash on the project url', () => {
    import.meta.env.VITE_SUPABASE_URL = 'https://abc.supabase.co/'
    expect(feedUrl('user-1', 'tok')).not.toContain('.co//storage')
  })

  it('contains the token, which is what keeps the url private', () => {
    import.meta.env.VITE_SUPABASE_URL = 'https://abc.supabase.co'
    expect(feedUrl('user-1', 'secret-token')).toContain('secret-token')
  })
})
