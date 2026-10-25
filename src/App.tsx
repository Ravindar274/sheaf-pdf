import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { AdSlot } from './components/AdSlot'
import { PageCard, PageThumb } from './components/PageCard'
import { buildPdf, forgetDoc, loadPdf, PdfLoadError, type PageItem, type Rotation, type SourceDoc } from './lib/pdf'
import './App.css'

const DOC_COLORS = ['#2563eb', '#d97706', '#059669', '#db2777', '#7c3aed', '#0891b2']
const newId = () => Math.random().toString(36).slice(2, 10)

export default function App() {
  const [docs, setDocs] = useState<Map<string, SourceDoc>>(new Map())
  const [pages, setPages] = useState<PageItem[]>([])
  const [history, setHistory] = useState<PageItem[][]>([])
  const [loading, setLoading] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [fileName, setFileName] = useState('merged')
  const [exporting, setExporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const pagesRef = useRef(pages)
  pagesRef.current = pages

  const colorOf = useMemo(() => {
    const m = new Map<string, string>()
    ;[...docs.keys()].forEach((id, i) => m.set(id, DOC_COLORS[i % DOC_COLORS.length]))
    return m
  }, [docs])

  /** Change the page list and keep the previous state for undo. */
  const commit = useCallback((update: (p: PageItem[]) => PageItem[]) => {
    const prev = pagesRef.current
    const next = update(prev)
    if (next === prev) return
    setHistory((h) => [...h.slice(-49), prev])
    setPages(next)
  }, [])

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h
      setPages(h[h.length - 1])
      return h.slice(0, -1)
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  const addFiles = useCallback(
    async (input: FileList | File[]) => {
      const all = [...input]
      const list = all.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
      const skipped = all.length - list.length
      if (skipped) setErrors((e) => [...e, `Skipped ${skipped} file${skipped > 1 ? 's' : ''} that ${skipped > 1 ? "aren't PDFs" : "isn't a PDF"}.`])
      if (!list.length) return

      setLoading((n) => n + list.length)
      // Load in parallel, but add in the order the user picked them.
      const results = await Promise.allSettled(list.map(loadPdf))
      setLoading((n) => n - list.length)

      const newDocs: SourceDoc[] = []
      const newPages: PageItem[] = []
      const failed: string[] = []
      results.forEach((r) => {
        if (r.status === 'fulfilled') {
          newDocs.push(r.value.doc)
          newPages.push(...r.value.pages)
        } else {
          failed.push(r.reason instanceof PdfLoadError ? r.reason.message : 'A file could not be read.')
        }
      })
      if (failed.length) setErrors((e) => [...e, ...failed])
      if (!newDocs.length) return

      const wasEmpty = pagesRef.current.length === 0
      setDocs((d) => {
        const m = new Map(d)
        newDocs.forEach((doc) => m.set(doc.id, doc))
        return m
      })
      commit((p) => [...p, ...newPages])
      if (wasEmpty && newDocs.length === 1) {
        setFileName((name) => (name === 'merged' ? newDocs[0].name.replace(/\.pdf$/i, '') + '-edited' : name))
      }
    },
    [commit],
  )

  // Accept files dropped anywhere on the page.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragOver(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDragOver(false)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragOver(false)
      if (e.dataTransfer?.files.length) void addFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [addFiles])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    commit((p) => arrayMove(p, p.findIndex((x) => x.id === active.id), p.findIndex((x) => x.id === over.id)))
  }

  const rotate = useCallback(
    (id: string, by: 90 | -90) =>
      commit((p) => p.map((x) => (x.id === id ? { ...x, rotation: ((((x.rotation + by) % 360) + 360) % 360) as Rotation } : x))),
    [commit],
  )
  const remove = useCallback((id: string) => commit((p) => p.filter((x) => x.id !== id)), [commit])
  const duplicate = useCallback(
    (id: string) =>
      commit((p) => {
        const i = p.findIndex((x) => x.id === id)
        return [...p.slice(0, i + 1), { ...p[i], id: newId() }, ...p.slice(i + 1)]
      }),
    [commit],
  )
  const move = useCallback(
    (id: string, dir: -1 | 1) =>
      commit((p) => {
        const i = p.findIndex((x) => x.id === id)
        const j = i + dir
        return j < 0 || j >= p.length ? p : arrayMove(p, i, j)
      }),
    [commit],
  )

  const removeDoc = (docId: string) => commit((p) => p.filter((x) => x.docId !== docId))
  const reverse = () => commit((p) => [...p].reverse())

  const clearAll = () => {
    docs.forEach(forgetDoc)
    setDocs(new Map())
    setPages([])
    setHistory([])
    setFileName('merged')
  }

  const download = async () => {
    if (!pages.length) return
    setExporting(true)
    try {
      const bytes = await buildPdf(pages, docs)
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${(fileName.trim() || 'merged').replace(/\.pdf$/i, '')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      console.error(err)
      setErrors((e) => [...e, "Couldn't create the PDF. One of the files may be encrypted or damaged."])
    } finally {
      setExporting(false)
    }
  }

  // Files that still have at least one page on the board.
  const docsInUse = useMemo(() => {
    const counts = new Map<string, number>()
    pages.forEach((p) => counts.set(p.docId, (counts.get(p.docId) ?? 0) + 1))
    return [...docs.values()].filter((d) => counts.has(d.id)).map((d) => ({ doc: d, count: counts.get(d.id)! }))
  }, [docs, pages])

  const activePage = activeId ? pages.find((p) => p.id === activeId) : undefined
  const empty = pages.length === 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>Sheaf</span>
        </div>
        <p className="tagline">Merge and reorder PDFs. Files never leave your device.</p>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {errors.length > 0 && (
        <div className="alerts" role="alert">
          {errors.map((msg, i) => (
            <div className="alert" key={i}>
              <span>{msg}</span>
              <button className="icon-btn" aria-label="Dismiss" onClick={() => setErrors((e) => e.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {empty ? (
        <main className="empty">
          <button className={`dropzone ${dragOver ? 'is-over' : ''}`} onClick={() => inputRef.current?.click()}>
            <UploadIcon />
            <strong>{loading ? 'Reading files…' : 'Drop PDFs here'}</strong>
            <span>or click to choose files</span>
          </button>
          <ul className="features">
            <li>Unlimited and free</li>
            <li>No sign-up</li>
            <li>Nothing is uploaded</li>
          </ul>
        </main>
      ) : (
        <main className="workspace">
          <div className="toolbar">
            <div className="toolbar-group">
              <button className="btn" onClick={() => inputRef.current?.click()}>
                + Add PDFs
              </button>
              <button className="btn ghost" onClick={undo} disabled={!history.length} title="Undo (Ctrl+Z)">
                Undo
              </button>
              <button className="btn ghost" onClick={reverse} disabled={pages.length < 2}>
                Reverse
              </button>
              <button className="btn ghost danger" onClick={clearAll}>
                Clear all
              </button>
            </div>
            <div className="toolbar-group export">
              <label className="filename">
                <input value={fileName} onChange={(e) => setFileName(e.target.value)} aria-label="Output file name" spellCheck={false} />
                <span>.pdf</span>
              </label>
              <button className="btn primary" onClick={download} disabled={exporting}>
                {exporting ? 'Building…' : `Download ${pages.length} page${pages.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>

          <div className="files">
            {docsInUse.map(({ doc, count }) => (
              <span className="file-chip" key={doc.id} style={{ ['--c' as string]: colorOf.get(doc.id) }}>
                <i />
                <span className="file-name" title={doc.name}>
                  {doc.name}
                </span>
                <span className="file-count">{count}</span>
                <button className="icon-btn" aria-label={`Remove all pages from ${doc.name}`} onClick={() => removeDoc(doc.id)}>
                  ×
                </button>
              </span>
            ))}
            {loading > 0 && <span className="file-chip loading">Reading {loading} file{loading > 1 ? 's' : ''}…</span>}
          </div>

          <p className="hint">Drag pages to reorder. On a phone, press and hold a page first.</p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
              <ol className="grid">
                {pages.map((p, i) => (
                  <PageCard
                    key={p.id}
                    page={p}
                    doc={docs.get(p.docId)!}
                    color={colorOf.get(p.docId)!}
                    position={i + 1}
                    total={pages.length}
                    onRotate={rotate}
                    onRemove={remove}
                    onDuplicate={duplicate}
                    onMove={move}
                  />
                ))}
              </ol>
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
              {activePage ? (
                <div className="card overlay" style={{ ['--c' as string]: colorOf.get(activePage.docId) }}>
                  <PageThumb page={activePage} doc={docs.get(activePage.docId)!} eager />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </main>
      )}

      {dragOver && !empty && <div className="drop-veil">Drop to add PDFs</div>}

      <div className="ad-slot">
        <AdSlot slot="0000000000" />
      </div>

      <footer className="footer">Everything runs in your browser. Your files are never uploaded.</footer>
    </div>
  )
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="9" y="3" width="17" height="22" rx="3" fill="var(--accent)" opacity=".35" />
      <rect x="6" y="7" width="17" height="22" rx="3" fill="var(--accent)" />
      <path d="M10 14h9M10 18h9M10 22h6" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
    </svg>
  )
}
