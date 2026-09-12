import type { PdfDocument } from '../../types/models'

/** Placeholder until Phase 3. */
export function PdfViewerPane({ pdf }: { pdf: PdfDocument }) {
  return (
    <div className="empty" style={{ flex: 1 }}>
      <h3>{pdf.name}</h3>
      <p>PDF viewing arrives in Phase 3.</p>
    </div>
  )
}
