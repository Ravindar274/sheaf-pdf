import { memo, useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { renderThumb, type PageItem, type SourceDoc } from '../lib/pdf'

interface CardProps {
  page: PageItem
  doc: SourceDoc
  color: string
  position: number
  total: number
  onRotate: (id: string, by: 90 | -90) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
}

export const PageCard = memo(function PageCard({ page, doc, color, position, total, onRotate, onRemove, onDuplicate, onMove }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })

  return (
    <li
      ref={setNodeRef}
      className={`card ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition, ['--c' as string]: color }}
    >
      <div
        className="card-handle"
        {...attributes}
        {...listeners}
        aria-label={`Page ${position} of ${total}, page ${page.pageIndex + 1} of ${doc.name}. Press space to pick up and use arrow keys to move.`}
      >
        <PageThumb page={page} doc={doc} />
      </div>

      <div className="card-meta">
        <span className="pos">{position}</span>
        <span className="src" title={`${doc.name}, page ${page.pageIndex + 1}`}>
          p.{page.pageIndex + 1}
        </span>
      </div>

      <div className="card-actions">
        <button className="icon-btn" onClick={() => onRotate(page.id, -90)} aria-label="Rotate left" title="Rotate left">
          <RotateIcon flip />
        </button>
        <button className="icon-btn" onClick={() => onRotate(page.id, 90)} aria-label="Rotate right" title="Rotate right">
          <RotateIcon />
        </button>
        <button className="icon-btn" onClick={() => onDuplicate(page.id)} aria-label="Duplicate page" title="Duplicate">
          <CopyIcon />
        </button>
        <button className="icon-btn danger" onClick={() => onRemove(page.id)} aria-label="Delete page" title="Delete">
          <TrashIcon />
        </button>
      </div>

      {/* Move buttons: an easy fallback for touch and screen-reader users. */}
      <div className="card-move">
        <button className="icon-btn" onClick={() => onMove(page.id, -1)} disabled={position === 1} aria-label="Move earlier" title="Move earlier">
          ‹
        </button>
        <button className="icon-btn" onClick={() => onMove(page.id, 1)} disabled={position === total} aria-label="Move later" title="Move later">
          ›
        </button>
      </div>
    </li>
  )
})

/** Thumbnail that renders only once it scrolls into view. */
export function PageThumb({ page, doc, eager = false }: { page: PageItem; doc: SourceDoc; eager?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(eager)
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (visible || !ref.current) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '400px' },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let alive = true
    setFailed(false)
    renderThumb(doc, page.pageIndex, page.rotation)
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [visible, doc, page.pageIndex, page.rotation])

  return (
    <div className="thumb" ref={ref}>
      {src ? (
        <img src={src} alt="" draggable={false} />
      ) : failed ? (
        <span className="thumb-fail">Preview unavailable</span>
      ) : (
        <span className="thumb-skeleton" />
      )}
    </div>
  )
}

function RotateIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={flip ? { transform: 'scaleX(-1)' } : undefined} aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  )
}
