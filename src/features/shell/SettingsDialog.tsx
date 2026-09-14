import { useRef, useState } from 'react'
import { ConfirmDialog, Modal } from '../../components/Modal'
import { toast } from '../../components/toastStore'
import { fileStore } from '../../data'
import { backupFilename, createBackup, parseBackup, restoreBackup } from '../../data/backup'
import { currentData, useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { useSync } from '../../data/sync/syncStore'
import { SyncSettings } from './SyncSettings'
import { CalendarFeedSettings } from './CalendarFeedSettings'

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen)
  const setOpen = useUi((s) => s.setSettingsOpen)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const resetAll = useStore((s) => s.resetAll)
  const importData = useStore((s) => s.importData)
  const [confirmReset, setConfirmReset] = useState(false)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const syncedAccount = useSync((s) => s.account)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportJson = async () => {
    setBusy('export')
    try {
      const backup = await createBackup(currentData(), fileStore)
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = backupFilename()
      a.click()
      URL.revokeObjectURL(url)
      const pdfs = Object.keys(backup.files).length
      toast(`Backup saved · ${formatSize(blob.size)}${pdfs ? ` · ${pdfs} PDF${pdfs === 1 ? '' : 's'}` : ''}`)
    } catch (err) {
      console.error(err)
      toast('Could not create the backup')
    } finally {
      setBusy(null)
    }
  }

  const importJson = async (file: File) => {
    setBusy('import')
    try {
      const backup = parseBackup(await file.text())
      importData(await restoreBackup(backup, fileStore, currentData()))
      toast('Backup restored')
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'That file could not be imported')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Settings">
      <div className="modal-body" style={{ gap: 0 }}>
        <div className="settings-row">
          <div>
            <div className="label">Appearance</div>
            <div className="desc">Follow the system, or pick one.</div>
          </div>
          <div className="segmented">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} className={settings.theme === t ? 'active' : ''} onClick={() => updateSettings({ theme: t })}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Week starts on</div>
          </div>
          <div className="segmented">
            <button className={settings.weekStartsOn === 1 ? 'active' : ''} onClick={() => updateSettings({ weekStartsOn: 1 })}>
              Monday
            </button>
            <button className={settings.weekStartsOn === 0 ? 'active' : ''} onClick={() => updateSettings({ weekStartsOn: 0 })}>
              Sunday
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Day starts at</div>
            <div className="desc">Where the week view scrolls to.</div>
          </div>
          <select className="select" style={{ width: 110 }} value={settings.dayStartHour} onChange={(e) => updateSettings({ dayStartHour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Show completed tasks</div>
            <div className="desc">Keep finished assignments visible on the calendar.</div>
          </div>
          <button role="switch" aria-checked={settings.showCompleted} className="switch" onClick={() => updateSettings({ showCompleted: !settings.showCompleted })} />
        </div>
        <SyncSettings />
        <CalendarFeedSettings />
        <div className="settings-row">
          <div>
            <div className="label">Your data</div>
            <div className="desc">
              {syncedAccount
                ? 'Synced to your account. An export is a portable backup — it includes your PDFs.'
                : 'Stored in this browser only. An export is your only backup — it includes your PDFs.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn sm" onClick={exportJson} disabled={busy !== null}>
              {busy === 'export' ? 'Exporting…' : 'Export'}
            </button>
            <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              {busy === 'import' ? 'Importing…' : 'Import'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importJson(f)
                e.target.value = ''
              }}
            />
            <button className="btn sm danger" onClick={() => setConfirmReset(true)} disabled={busy !== null}>
              Reset
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmReset}
        title="Erase everything?"
        message={
          syncedAccount
            ? 'This removes all classes, events, notes and PDFs from this browser and from your synced account, on every device. Export first if you want a backup.'
            : 'This removes all classes, events, notes and PDFs from this browser. Export first if you want a backup.'
        }
        confirmLabel="Erase all data"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          await resetAll()
          setConfirmReset(false)
          setOpen(false)
          toast('All data erased')
        }}
      />
    </Modal>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
