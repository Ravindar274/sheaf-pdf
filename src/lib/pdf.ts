import * as pdfjs from 'pdfjs-dist'
import type { PDFDocument as LibDoc } from 'pdf-lib'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type Rotation = 0 | 90 | 180 | 270

export interface SourceDoc {
  id: string
  name: string
  bytes: Uint8Array
  pdf: pdfjs.PDFDocumentProxy
  pageCount: number
}

export interface PageItem {
  id: string
  docId: string
  pageIndex: number // 0-based index in the source doc
  rotation: Rotation // extra rotation applied by the user
}

const uid = () => Math.random().toString(36).slice(2, 10)

export class PdfLoadError extends Error {}

/** Read a File, parse it with pdf.js and return the source doc plus its pages. */
export async function loadPdf(file: File): Promise<{ doc: SourceDoc; pages: PageItem[] }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let pdf: pdfjs.PDFDocumentProxy
  try {
    // pdf.js transfers the buffer to its worker, so give it a copy.
    pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'PasswordException') {
      throw new PdfLoadError(`"${file.name}" is password protected. Unlock it first, then add it again.`)
    }
    throw new PdfLoadError(`"${file.name}" couldn't be read. It may be damaged or not a PDF.`)
  }

  // Files with edit restrictions open fine, but pdf-lib can't decrypt them, so the
  // exported pages would be blank or broken. Refuse them up front instead.
  const { info } = await pdf.getMetadata().catch(() => ({ info: {} }))
  if ((info as { EncryptFilterName?: string }).EncryptFilterName) {
    void pdf.loadingTask.destroy()
    throw new PdfLoadError(`"${file.name}" has security restrictions, so it can't be edited here. Remove the restrictions first, then add it again.`)
  }

  const doc: SourceDoc = { id: uid(), name: file.name, bytes, pdf, pageCount: pdf.numPages }
  const pages: PageItem[] = Array.from({ length: pdf.numPages }, (_, i) => ({
    id: uid(),
    docId: doc.id,
    pageIndex: i,
    rotation: 0,
  }))
  return { doc, pages }
}

const thumbCache = new Map<string, Promise<string>>()

/** Render one page to a small image (data URL). Results are cached. */
export function renderThumb(doc: SourceDoc, pageIndex: number, rotation: Rotation, width = 180): Promise<string> {
  const key = `${doc.id}:${pageIndex}:${rotation}:${width}`
  const hit = thumbCache.get(key)
  if (hit) return hit

  const job = (async () => {
    const page = await doc.pdf.getPage(pageIndex + 1)
    const totalRotation = (page.rotate + rotation) % 360
    const base = page.getViewport({ scale: 1, rotation: totalRotation })
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const viewport = page.getViewport({ scale: (width / base.width) * dpr, rotation: totalRotation })

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport }).promise
    const url = canvas.toDataURL('image/jpeg', 0.8)
    canvas.width = canvas.height = 0 // free memory early
    return url
  })()

  thumbCache.set(key, job)
  job.catch(() => thumbCache.delete(key))
  return job
}

export function forgetDoc(doc: SourceDoc) {
  for (const key of thumbCache.keys()) if (key.startsWith(`${doc.id}:`)) thumbCache.delete(key)
  void doc.pdf.loadingTask.destroy()
}

/** Build a new PDF from the pages in the given order. Runs entirely in the browser. */
export async function buildPdf(pages: PageItem[], docs: Map<string, SourceDoc>): Promise<Uint8Array> {
  // Loaded on first export so the initial page stays light.
  const { PDFDocument, degrees } = await import('pdf-lib')
  const out = await PDFDocument.create()
  const loaded = new Map<string, LibDoc>()

  for (const item of pages) {
    const src = docs.get(item.docId)
    if (!src) continue
    let srcDoc = loaded.get(src.id)
    if (!srcDoc) {
      // ignoreEncryption lets owner-password-only PDFs (print/edit restrictions) through.
      srcDoc = await PDFDocument.load(src.bytes, { ignoreEncryption: true })
      loaded.set(src.id, srcDoc)
    }
    const [copied] = await out.copyPages(srcDoc, [item.pageIndex])
    if (item.rotation) {
      const current = copied.getRotation().angle
      copied.setRotation(degrees((current + item.rotation) % 360))
    }
    out.addPage(copied)
  }

  out.setProducer('Sheaf')
  out.setCreator('Sheaf')
  return out.save()
}
