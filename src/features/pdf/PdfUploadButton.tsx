import { useRef, useState } from 'react'
import { IconUpload } from '../../components/Icons'
import { toast } from '../../components/Toast'
import { Tooltip } from '../../components/Tooltip'
import { fileStore } from '../../data'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { newId } from '../../lib/ids'
import { loadPdf } from './pdfjs'

export async function importPdfFiles(files: File[]): Promise<number> {
  const { addPdf } = useStore.getState()
  const filter = useUi.getState().notesFilter
  let count = 0
  for (const file of files) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) continue
    try {
      const buf = await file.arrayBuffer()
      const doc = await loadPdf(buf.slice(0))
      const fileKey = `pdf:${newId()}`
      await fileStore.put(fileKey, new Blob([buf], { type: 'application/pdf' }))
      const pdf = addPdf({
        name: file.name.replace(/\.pdf$/i, ''),
        categoryId: filter?.categoryId ?? null,
        folderId: filter?.folderId ?? null,
        size: file.size,
        pageCount: doc.numPages,
        fileKey,
      })
      void doc.loadingTask.destroy()
      count++
      if (files.length === 1) useUi.getState().selectPdf(pdf.id)
    } catch (err) {
      console.error(err)
      toast(`Couldn't open ${file.name}`)
    }
  }
  return count
}

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
