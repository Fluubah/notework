// The "legacy" build carries polyfills (Map.getOrInsertComputed, Promise.try…)
// that the default build assumes; it keeps the viewer working on browsers a
// release or two behind the bleeding edge.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDocumentProxy = pdfjs.PDFDocumentProxy
export type PdfPageProxy = pdfjs.PDFPageProxy

export async function loadPdf(data: ArrayBuffer): Promise<PdfDocumentProxy> {
  return pdfjs.getDocument({ data }).promise
}

export { pdfjs }
