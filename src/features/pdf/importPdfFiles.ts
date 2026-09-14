import { toast } from '../../components/toastStore'
import { fileStore } from '../../data'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { newId } from '../../lib/ids'

export async function importPdfFiles(files: File[]): Promise<number> {
  const { addPdf } = useStore.getState()
  const filter = useUi.getState().notesFilter
  // pdf.js is heavy; only load it once someone actually imports a PDF.
  const { loadPdf } = await import('./pdfjs')
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
