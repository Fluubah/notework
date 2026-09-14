import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { useState } from 'react'
import { useSync } from '../../data/sync/syncStore'
import { useStore } from '../../data/store'
import type { SyncStatus } from '../../data/sync/types'

/**
 * Sync controls. Renders nothing when the build has no Supabase credentials,
 * so a local-only build is exactly the app it was before.
 */
export function SyncSettings() {
  const configured = useSync((s) => s.configured)
  const account = useSync((s) => s.account)
  if (!configured) return null

  return (
    <div className="settings-row sync-row">
      <div>
        <div className="label">Sync across devices</div>
        <div className="desc">
          {account
            ? 'This browser stays in step with your other signed-in devices.'
            : 'Optional. Without an account everything stays on this device.'}
        </div>
      </div>
      {account ? <SignedIn /> : <SignedOut />}
    </div>
  )
}

function SignedIn() {
  const account = useSync((s) => s.account)!
  const status = useSync((s) => s.status)
  const signOut = useSync((s) => s.signOut)
  const syncNow = useSync((s) => s.syncNow)
  const authBusy = useSync((s) => s.authBusy)
  const [syncing, setSyncing] = useState(false)

  return (
    <div className="sync-panel">
      <div className="sync-account">
        <span className="sync-email">{account.email ?? 'Signed in'}</span>
        <SyncStatusLine status={status} busy={syncing} />
      </div>
      <div className="sync-actions">
        <button
          className="btn sm"
          disabled={syncing || status.phase === 'syncing'}
          onClick={async () => {
            setSyncing(true)
            try {
              await syncNow()
            } finally {
              setSyncing(false)
            }
          }}
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
        <button className="btn sm" disabled={authBusy} onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  )
}

function SyncStatusLine({ status, busy }: { status: SyncStatus; busy: boolean }) {
  const pending = status.pendingUploads ?? 0
  const parts: string[] = []

  if (busy || status.phase === 'syncing') parts.push('Syncing…')
  else if (status.phase === 'offline') parts.push('Offline — changes are saved on this device')
  else if (status.phase === 'error') parts.push(status.message ?? 'Sync failed')
  else if (status.lastSyncedAt) parts.push(`Synced ${formatDistanceToNowStrict(parseISO(status.lastSyncedAt), { addSuffix: true })}`)
  else parts.push('Not synced yet')

  if (pending > 0) parts.push(`${pending} PDF${pending === 1 ? '' : 's'} waiting to upload`)

  return (
    <span className={`sync-status ${status.phase}`} role="status">
      {parts.join(' · ')}
    </span>
  )
}

function SignedOut() {
  const signIn = useSync((s) => s.signIn)
  const signUp = useSync((s) => s.signUp)
  const authBusy = useSync((s) => s.authBusy)
  const authError = useSync((s) => s.authError)
  const notice = useSync((s) => s.notice)
  const hasLocalData = useStore((s) => s.events.length + s.notes.length + s.pdfs.length + s.categories.length > 0)

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (!open) {
    return (
      <button className="btn sm" onClick={() => setOpen(true)}>
        Set up sync
      </button>
    )
  }

  const valid = email.includes('@') && password.length >= 6

  return (
    <form
      className="sync-panel sync-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid || authBusy) return
        void (mode === 'signin' ? signIn(email, password) : signUp(email, password))
      }}
    >
      <div className="segmented">
        <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>
          Sign in
        </button>
        <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
          Create account
        </button>
      </div>
      <input className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
      <input
        className="input"
        type="password"
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-label="Password"
      />
      {hasLocalData && (
        <p className="sync-warning">
          Your devices share one copy, and the most recently saved one wins. This browser already has data — export a
          backup first if you can&apos;t lose it.
        </p>
      )}
      {authError && <p className="sync-error">{authError}</p>}
      {notice && <p className="sync-notice">{notice}</p>}
      <div className="sync-actions">
        <button className="btn sm primary" type="submit" disabled={!valid || authBusy}>
          {authBusy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <button className="btn sm" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
