import { useRef, useState } from 'react'
import { IconUpload } from '../../components/Icons'
import { toast } from '../../components/toastStore'
import { Tooltip } from '../../components/Tooltip'
import { importPdfFiles } from './importPdfFiles'

export function PdfUploadButton() {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <Tooltip content="Upload PDF slides or readings">
        <button className="btn" onClick={() => ref.current?.click()} disabled={busy}>
          <IconUpload /> {busy ? 'Importing…' : 'Upload PDF'}
        </button>
      </Tooltip>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (!files.length) return
          setBusy(true)
          const n = await importPdfFiles(files)
          setBusy(false)
          if (n > 1) toast(`Imported ${n} PDFs`)
        }}
      />
    </>
  )
}
