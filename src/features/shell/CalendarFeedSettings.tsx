import { useState } from 'react'
import { toast } from '../../components/toastStore'
import { ensureCalendarToken, feedUrl, publishFeed, unpublishFeed } from '../../data/sync/calendarFeed'
import { useSync } from '../../data/sync/syncStore'
import { useStore } from '../../data/store'

/**
 * Publishes a .ics subscription URL. Only offered when signed in, because the
 * feed is hosted in the account's storage bucket.
 */
export function CalendarFeedSettings() {
  const configured = useSync((s) => s.configured)
  const account = useSync((s) => s.account)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!configured) return null

  const enabled = Boolean(settings.calendarFeedEnabled && settings.calendarToken)
  const url = account && settings.calendarToken ? feedUrl(account.id, settings.calendarToken) : null

  const toggle = async () => {
    if (!account) return
    setBusy(true)
    try {
      if (enabled) {
        if (settings.calendarToken) await unpublishFeed(account.id, settings.calendarToken)
        updateSettings({ calendarFeedEnabled: false })
        toast('Calendar feed turned off')
      } else {
        const token = ensureCalendarToken()
        const { events } = await publishFeed(account.id, token)
        updateSettings({ calendarFeedEnabled: true })
        toast(`Calendar published · ${events} event${events === 1 ? '' : 's'}`)
      }
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'Could not update the calendar feed')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Could not copy — select the link and copy it manually')
    }
  }

  return (
    <div className="settings-row sync-row">
      <div>
        <div className="label">Subscribe in your calendar app</div>
        <div className="desc">
          {account
            ? 'Publishes your classes, assignments and exams as a calendar your phone can subscribe to. Updates on its own.'
            : 'Sign in to sync first — the feed is published to your account.'}
        </div>
      </div>

      {!account ? (
        <span className="subtle" style={{ fontSize: 12.5 }}>Needs an account</span>
      ) : (
        <div className="sync-panel">
          <button role="switch" aria-checked={enabled} aria-label="Publish calendar feed" className="switch" disabled={busy} onClick={() => void toggle()} />

          {enabled && url && (
            <>
              <div className="feed-url" title={url}>{url}</div>
              <div className="sync-actions">
                <button className="btn sm" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</button>
                <select
                  className="select"
                  style={{ width: 130 }}
                  aria-label="Alert before events"
                  value={String(settings.calendarAlarmMinutes ?? 0)}
                  onChange={(e) => updateSettings({ calendarAlarmMinutes: Number(e.target.value) || null })}
                >
                  <option value="0">No alert</option>
                  <option value="15">15 min before</option>
                  <option value="60">1 hour before</option>
                  <option value="180">3 hours before</option>
                  <option value="1440">1 day before</option>
                </select>
              </div>
              <p className="sync-warning" style={{ marginTop: 2 }}>
                Anyone with this link can read your calendar — it&apos;s a secret address, not a password. On iPhone:
                Calendar → Calendars → Add Calendar → Add Subscription Calendar, then paste it.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
