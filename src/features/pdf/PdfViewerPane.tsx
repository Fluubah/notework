import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  IconCursor,
  IconEraser,
  IconHighlighter,
  IconMore,
  IconPen,
  IconSticky,
  IconTrash,
  IconType,
  IconUndo,
  IconZoomIn,
  IconZoomOut,
  IconDownload,
} from '../../components/Icons'
import { ConfirmDialog } from '../../components/Modal'
import { Popover, anchorFromEvent, type Anchor } from '../../components/Popover'
import { toast } from '../../components/Toast'
import { Tooltip } from '../../components/Tooltip'
import { fileStore } from '../../data'
import { useStore } from '../../data/store'
import { useUi } from '../../data/uiStore'
import { useHotkeys, MOD } from '../../hooks/useHotkeys'
import { fitWidthScale } from '../../lib/annotations'
import { UNCATEGORIZED_COLOR } from '../../lib/colors'
import type { Annotation, AnnotationTool, PdfDocument } from '../../types/models'
import { PdfPage } from './PdfPage'
import { loadPdf, type PdfDocumentProxy } from './pdfjs'
import { HIGHLIGHT_COLORS, INK_COLORS, INK_WIDTHS, usePdfTools } from './pdfToolsStore'
import { EventPicker } from '../links/EventPicker'
import { IconLink } from '../../components/Icons'
import { parseISO } from 'date-fns'

const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3]
const PAGE_GAP = 16
const SCROLL_PAD = 20

type UndoEntry = { type: 'add'; id: string } | { type: 'delete'; annotations: Annotation[] }

const TOOLS: { id: AnnotationTool; label: string; key: string; icon: React.ReactNode }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: <IconCursor /> },
  { id: 'ink', label: 'Pen', key: 'P', icon: <IconPen /> },
  { id: 'highlight', label: 'Highlighter', key: 'H', icon: <IconHighlighter /> },
  { id: 'text', label: 'Text box', key: 'T', icon: <IconType /> },
  { id: 'sticky', label: 'Sticky note', key: 'S', icon: <IconSticky /> },
  { id: 'eraser', label: 'Eraser', key: 'E', icon: <IconEraser /> },
]

export function PdfViewerPane({ pdf }: { pdf: PdfDocument }) {
  const [doc, setDoc] = useState<PdfDocumentProxy | null>(null)
  const [sizes, setSizes] = useState<{ width: number; height: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [fitWidth, setFitWidth] = useState(true)
  const [visible, setVisible] = useState<Set<number>>(new Set([1]))
  const [currentPage, setCurrentPage] = useState(pdf.lastPage ?? 1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menu, setMenu] = useState<Anchor | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const undoStack = useRef<UndoEntry[]>([])
  const restoredScroll = useRef(false)

  const tools = usePdfTools()
  const allAnnotations = useStore((s) => s.annotations)
  const annotations = useMemo(() => allAnnotations.filter((a) => a.pdfId === pdf.id), [allAnnotations, pdf.id])
  const categories = useStore((s) => s.categories)
  const folders = useStore((s) => s.folders)
  const events = useStore((s) => s.events)
  const linkedEvents = useMemo(() => events.filter((e) => e.linkedPdfIds.includes(pdf.id)), [events, pdf.id])
  const { updatePdf, deletePdf, deleteAnnotation, addAnnotation } = useStore()
  const ui = useUi()

  // ---- Load document
  useEffect(() => {
    let cancelled = false
    let loaded: PdfDocumentProxy | null = null
    void (async () => {
      try {
        const blob = await fileStore.get(pdf.fileKey)
        if (!blob) throw new Error('The PDF file is missing from this browser’s storage.')
        const d = await loadPdf(await blob.arrayBuffer())
        if (cancelled) {
          void d.loadingTask.destroy()
          return
        }
        loaded = d
        const s: { width: number; height: number }[] = []
        for (let i = 1; i <= d.numPages; i++) {
          const page = await d.getPage(i)
          const vp = page.getViewport({ scale: 1 })
          s.push({ width: vp.width, height: vp.height })
        }
        if (cancelled) return
        setSizes(s)
        setDoc(d)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
      void loaded?.loadingTask.destroy()
    }
  }, [pdf.fileKey])

  // ---- Fit width on resize
  const maxPageWidth = useMemo(() => sizes.reduce((m, s) => Math.max(m, s.width), 0), [sizes])
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !maxPageWidth) return
    const apply = () => {
      if (!fitWidth) return
      setScale(Math.min(3, fitWidthScale(el.clientWidth, maxPageWidth, SCROLL_PAD)))
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [maxPageWidth, fitWidth])

  // ---- Visibility tracking (lazy render) + current page
  useEffect(() => {
    const el = scrollRef.current
    if (!el || sizes.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev)
          for (const en of entries) {
            const n = Number((en.target as HTMLElement).dataset.page)
            if (en.isIntersecting) next.add(n)
            else next.delete(n)
          }
          return next
        })
      },
      { root: el, rootMargin: '800px 0px' },
    )
    el.querySelectorAll('.pdf-page-wrap').forEach((p) => io.observe(p))
    return () => io.disconnect()
  }, [sizes.length, doc])

  const pageOffsets = useMemo(() => {
    const out: number[] = []
    let y = SCROLL_PAD
    for (const s of sizes) {
      out.push(y)
      y += s.height * scale + PAGE_GAP
    }
    return out
  }, [sizes, scale])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || pageOffsets.length === 0) return
    const mid = el.scrollTop + el.clientHeight / 3
    let p = 1
    for (let i = 0; i < pageOffsets.length; i++) if (pageOffsets[i] <= mid) p = i + 1
    setCurrentPage(p)
  }, [pageOffsets])

  useEffect(() => {
    if (currentPage !== pdf.lastPage) {
      const id = window.setTimeout(() => updatePdf(pdf.id, { lastPage: currentPage }), 600)
      return () => window.clearTimeout(id)
    }
  }, [currentPage, pdf.id, pdf.lastPage, updatePdf])

  // Restore last page once the layout is known.
  useEffect(() => {
    if (restoredScroll.current || !doc || pageOffsets.length === 0) return
    restoredScroll.current = true
    const target = pdf.lastPage ?? 1
    if (target > 1 && scrollRef.current) scrollRef.current.scrollTop = pageOffsets[target - 1] - SCROLL_PAD
  }, [doc, pageOffsets, pdf.lastPage])

  // ---- Zoom, anchored on the viewport centre so the page doesn't jump.
  const zoomTo = (next: number) => {
    const el = scrollRef.current
    const clamped = Math.max(0.25, Math.min(4, next))
    if (el) {
      const ratio = clamped / scale
      const cx = el.scrollLeft + el.clientWidth / 2
      const cy = el.scrollTop + el.clientHeight / 2
      requestAnimationFrame(() => {
        el.scrollLeft = cx * ratio - el.clientWidth / 2
        el.scrollTop = cy * ratio - el.clientHeight / 2
      })
    }
    setFitWidth(false)
    setScale(clamped)
  }
  const zoomIn = () => zoomTo(ZOOM_STEPS.find((z) => z > scale + 0.01) ?? scale * 1.25)
  const zoomOut = () => zoomTo([...ZOOM_STEPS].reverse().find((z) => z < scale - 0.01) ?? scale / 1.25)

  // Pinch-to-zoom on trackpads arrives as ctrl+wheel.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.01)
      zoomTo(scale * factor)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const undo = () => {
    const entry = undoStack.current.pop()
    if (!entry) return
    if (entry.type === 'add') deleteAnnotation(entry.id)
    else for (const a of entry.annotations) addAnnotation(a)
  }

  useHotkeys(
    [
      { combo: 'v', handler: () => tools.setTool('select') },
      { combo: 'p', handler: () => tools.setTool('ink') },
      { combo: 'h', handler: () => tools.setTool('highlight') },
      { combo: 't', handler: () => tools.setTool('text') },
      { combo: 's', handler: () => tools.setTool('sticky') },
      { combo: 'e', handler: () => tools.setTool('eraser') },
      { combo: 'mod+z', handler: undo, allowInInput: false },
      { combo: 'mod+=', handler: zoomIn, allowInInput: true },
      { combo: 'mod+-', handler: zoomOut, allowInInput: true },
      { combo: 'mod+0', handler: () => setFitWidth(true), allowInInput: true },
      { combo: 'Escape', handler: () => setSelectedId(null) },
    ],
    [scale, tools.tool],
  )

  const goToPage = (n: number) => {
    const el = scrollRef.current
    if (!el || !pageOffsets[n - 1]) return
    el.scrollTo({ top: pageOffsets[n - 1] - SCROLL_PAD, behavior: 'smooth' })
  }

  const downloadOriginal = async () => {
    const blob = await fileStore.get(pdf.fileKey)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pdf.name}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const category = categories.find((c) => c.id === pdf.categoryId)
  const catFolders = folders.filter((f) => f.categoryId === pdf.categoryId)
  const activeColor = tools.tool === 'highlight' ? tools.highlightColor : tools.inkColor
  const palette = tools.tool === 'highlight' ? HIGHLIGHT_COLORS : INK_COLORS
  const showInkOptions = tools.tool === 'ink' || tools.tool === 'highlight' || tools.tool === 'text'

  return (
    <div className="pdf-pane">
      <div className="pdf-toolbar">
        <input
          className="pdf-title"
          defaultValue={pdf.name}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v && v !== pdf.name) updatePdf(pdf.id, { name: v })
            else e.target.value = pdf.name
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="PDF name"
        />
        <span className="sep" />
        {TOOLS.map((t) => (
          <Tooltip key={t.id} content={`${t.label} · ${t.key}`}>
            <button className={`tool-btn ${tools.tool === t.id ? 'active' : ''}`} onClick={() => tools.setTool(t.id)} aria-label={t.label} aria-pressed={tools.tool === t.id}>
              {t.icon}
            </button>
          </Tooltip>
        ))}
        {/* Always occupies space so the toolbar never reflows when switching tools. */}
        <div className="ink-options" style={{ visibility: showInkOptions ? 'visible' : 'hidden' }}>
          <>
            <span className="sep" />
            <div className="ink-colors">
              {palette.map((c) => (
                <button key={c} className={`ink-color ${activeColor === c ? 'active' : ''}`} style={{ background: c }} onClick={() => tools.setColor(c)} aria-label={`Colour ${c}`} />
              ))}
              <label className={`ink-color custom ${!palette.includes(activeColor) ? 'active' : ''}`} title="Custom colour">
                <input type="color" value={activeColor} onChange={(e) => tools.setColor(e.target.value)} aria-label="Custom colour" />
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', visibility: tools.tool === 'text' ? 'hidden' : 'visible' }}>
              <>
                <span className="sep" />
                <div className="width-picker" role="radiogroup" aria-label="Stroke width">
                  {INK_WIDTHS.map((w, i) => (
                    <button key={w} className={tools.inkWidth === w ? 'active' : ''} onClick={() => tools.setInkWidth(w)} aria-label={['Thin', 'Medium', 'Thick'][i]} role="radio" aria-checked={tools.inkWidth === w}>
                      <span style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
                    </button>
                  ))}
                </div>
              </>
            </div>
          </>
        </div>
        <span className="sep" />
        <Tooltip content={`Undo · ${MOD}Z`}>
          <button className="tool-btn" onClick={undo} aria-label="Undo">
            <IconUndo />
          </button>
        </Tooltip>
        <span className="spacer" />
        <div className="pdf-pages">
          <input
            className="input"
            type="number"
            min={1}
            max={sizes.length || 1}
            value={currentPage}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (n >= 1 && n <= sizes.length) goToPage(n)
            }}
            aria-label="Page"
          />
          <span>/ {sizes.length || pdf.pageCount}</span>
        </div>
        <span className="sep" />
        <div className="pdf-zoom">
          <Tooltip content={`Zoom out · ${MOD}−`}>
            <button className="tool-btn" onClick={zoomOut} aria-label="Zoom out">
              <IconZoomOut />
            </button>
          </Tooltip>
          <Tooltip content={`Fit width · ${MOD}0`}>
            <span className="val" onClick={() => setFitWidth(true)} role="button" data-testid="zoom-val">
              {Math.round(scale * 100)}%
            </span>
          </Tooltip>
          <Tooltip content={`Zoom in · ${MOD}+`}>
            <button className="tool-btn" onClick={zoomIn} aria-label="Zoom in">
              <IconZoomIn />
            </button>
          </Tooltip>
        </div>
        <button className="tool-btn" onClick={(e) => setMenu(anchorFromEvent(e))} aria-label="PDF options" style={{ marginLeft: 4 }}>
          <IconMore />
        </button>
      </div>

      <div ref={scrollRef} className={`pdf-scroll tool-${tools.tool}`} onScroll={onScroll} onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}>
        {error && (
          <div className="empty">
            <h3>Couldn’t open this PDF</h3>
            <p>{error}</p>
          </div>
        )}
        {doc &&
          sizes.map((size, i) => (
            <PdfPage
              key={i + 1}
              doc={doc}
              pdfId={pdf.id}
              pageNumber={i + 1}
              size={size}
              scale={scale}
              visible={visible.has(i + 1)}
              annotations={annotations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAnnotationAdded={(id) => undoStack.current.push({ type: 'add', id })}
              onAnnotationsDeleted={(anns) => undoStack.current.push({ type: 'delete', annotations: anns })}
            />
          ))}
        {!doc && !error && (
          <div className="pdf-page-wrap loading" style={{ width: Math.min(700, (scrollRef.current?.clientWidth ?? 800) - 40), height: 900 }} />
        )}
      </div>

      <Popover anchor={menu} onClose={() => setMenu(null)} placement="bottom-end" width={260}>
        <div className="menu-heading">Organise</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '2px 6px 8px' }}>
          <div className="cat-select-wrap">
            <span className="dot" style={{ background: category?.color ?? UNCATEGORIZED_COLOR }} />
            <select className="select" value={pdf.categoryId ?? ''} onChange={(e) => updatePdf(pdf.id, { categoryId: e.target.value || null, folderId: null })} aria-label="Class">
              <option value="">No class</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {catFolders.length > 0 && (
            <select className="select" value={pdf.folderId ?? ''} onChange={(e) => updatePdf(pdf.id, { folderId: e.target.value || null })} aria-label="Folder">
              <option value="">No folder</option>
              {catFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="menu-sep" />
        {linkedEvents.length > 0 && (
          <>
            <div className="menu-heading">Attached to</div>
            {linkedEvents.map((e) => (
              <button
                key={e.id}
                className="menu-item"
                onClick={() => {
                  setMenu(null)
                  ui.setAnchorDate(parseISO(e.start))
                  ui.setSection('calendar')
                  ui.selectOccurrence(e.recurrence ? `${e.id}@${e.start}` : e.id)
                }}
              >
                <span className="truncate">{e.title}</span>
              </button>
            ))}
          </>
        )}
        <button
          className="menu-item"
          onClick={() => {
            setMenu(null)
            setAttaching(true)
          }}
        >
          <IconLink /> Attach to event…
        </button>
        <button
          className="menu-item"
          onClick={() => {
            setMenu(null)
            void downloadOriginal()
          }}
        >
          <IconDownload /> Download original
        </button>
        <div className="menu-sep" />
        <button
          className="menu-item danger"
          onClick={() => {
            setMenu(null)
            setConfirmDelete(true)
          }}
        >
          <IconTrash /> Delete PDF
        </button>
      </Popover>
      {attaching && <EventPicker item={{ type: 'pdf', id: pdf.id, title: pdf.name }} onClose={() => setAttaching(false)} />}
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${pdf.name}”?`}
        message={`The file and its ${annotations.length} annotation${annotations.length === 1 ? '' : 's'} will be removed.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false)
          ui.selectPdf(null)
          await deletePdf(pdf.id)
          toast('PDF deleted')
        }}
      />
    </div>
  )
}
