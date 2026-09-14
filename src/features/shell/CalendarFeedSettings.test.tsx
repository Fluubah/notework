import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarFeedSettings } from './CalendarFeedSettings'
import { useStore } from '../../data/store'
import { DEFAULT_SETTINGS } from '../../types/models'

const account = { id: '7431eab6-ff85-4eb4-8ca3-5b6ee7dc4360', email: 'me@example.com' }
let signedIn = true

vi.mock('../../data/sync/syncStore', () => ({
  useSync: (selector: (s: unknown) => unknown) => selector({ configured: true, account: signedIn ? account : null }),
}))

function setSettings(patch: Record<string, unknown>) {
  useStore.setState({ settings: { ...DEFAULT_SETTINGS, calendarFeedEnabled: true, calendarToken: 'tok123', ...patch } })
}

describe('CalendarFeedSettings alert kinds', () => {
  beforeEach(() => {
    signedIn = true
    import.meta.env.VITE_SUPABASE_URL = 'https://abc.supabase.co'
    setSettings({ calendarAlarmMinutes: 60, calendarAlarmKinds: ['assignment', 'exam'] })
  })

  it('offers every kind, with the deadline ones on by default', () => {
    render(<CalendarFeedSettings />)
    for (const label of ['Assignment', 'Exam', 'Event', 'Class']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Assignment' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Exam' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Class' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('turns a kind on and off', async () => {
    const user = userEvent.setup()
    render(<CalendarFeedSettings />)

    await user.click(screen.getByRole('button', { name: 'Class' }))
    expect(useStore.getState().settings.calendarAlarmKinds).toContain('class')

    await user.click(screen.getByRole('button', { name: 'Exam' }))
    expect(useStore.getState().settings.calendarAlarmKinds).not.toContain('exam')
  })

  it('hides the picker when alerts are off, since it would mean nothing', () => {
    setSettings({ calendarAlarmMinutes: 0 })
    render(<CalendarFeedSettings />)
    expect(screen.queryByRole('button', { name: 'Exam' })).not.toBeInTheDocument()
  })

  it('shows the subscription link', () => {
    render(<CalendarFeedSettings />)
    expect(screen.getByText(/notework-calendars/)).toBeInTheDocument()
  })

  it('asks for an account when signed out', () => {
    signedIn = false
    render(<CalendarFeedSettings />)
    expect(screen.getByText('Needs an account')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exam' })).not.toBeInTheDocument()
  })
})
