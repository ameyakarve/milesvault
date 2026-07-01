'use client'

// Client-only: pdf.js (`pdfjs-dist`) ships ESM that touches `DOMMatrix`,
// `OffscreenCanvas`, and a Web Worker — none of which exist in workerd.
// All exports here must be imported from client components only.

import type { PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api'

export type ExtractError =
  | { kind: 'need_password' }
  | { kind: 'wrong_password' }
  | { kind: 'image_only' }
  | { kind: 'invalid_pdf'; message: string }
  | { kind: 'unknown'; message: string }

export class StatementExtractError extends Error {
  constructor(public readonly detail: ExtractError) {
    super(detail.kind === 'invalid_pdf' || detail.kind === 'unknown' ? detail.message : detail.kind)
    this.name = 'StatementExtractError'
  }
}

// Pages with very little text after extraction are almost always image-only
// scans; surface that explicitly so the UI can tell the user we can't OCR yet.
const MIN_CHARS_FOR_TEXT_PDF = 500

// Defensive caps (owner call). A statement is a handful of pages; a 25MB
// upload or a 50-page render is almost certainly a mistake or abuse — and the
// vision path bills per page-image. Enforced at the client (reject early) AND
// the server (never trust the client).
export const MAX_STATEMENT_BYTES = 15 * 1024 * 1024 // 15 MB
export const MAX_STATEMENT_PAGES = 15

// pdf.js groups text into TextItems with `transform = [a,b,c,d,e,f]` where
// (e,f) is the baseline origin. We bucket items by integer Y and sort by X
// to reconstruct rows — this preserves table layout well enough for most
// statements without proper layout analysis.
const Y_BUCKET_TOLERANCE = 3

type LoadedPdfjs = typeof import('pdfjs-dist')

let pdfjsModulePromise: Promise<LoadedPdfjs> | null = null

// Safari < 17.4 ships ReadableStream WITHOUT async iteration (no
// `Symbol.asyncIterator` / `.values()`). pdf.js (v5) `for await (… of stream)`s
// the PDF data, so on those Safaris an encrypted statement dies with
// "undefined is not a function (near '…t of e…')". Install the spec async
// iterator when absent — idempotent, client-only, additive (no-op on browsers
// that already have it).
function ensureReadableStreamAsyncIterator(): void {
  const proto = (globalThis as unknown as { ReadableStream?: { prototype?: Record<PropertyKey, unknown> } })
    .ReadableStream?.prototype
  if (!proto || proto[Symbol.asyncIterator]) return
  const values = function (
    this: ReadableStream,
    options?: { preventCancel?: boolean },
  ): AsyncIterableIterator<unknown> {
    const reader = this.getReader()
    const preventCancel = options?.preventCancel ?? false
    return {
      async next() {
        try {
          const r = await reader.read()
          if (r.done) reader.releaseLock()
          return r
        } catch (e) {
          reader.releaseLock()
          throw e
        }
      },
      async return(value?: unknown) {
        if (!preventCancel) await reader.cancel(value)
        reader.releaseLock()
        return { value, done: true }
      },
      [Symbol.asyncIterator]() {
        return this
      },
    } as AsyncIterableIterator<unknown>
  }
  proto.values = values
  proto[Symbol.asyncIterator] = values
}

async function loadPdfjs(): Promise<LoadedPdfjs> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      ensureReadableStreamAsyncIterator()
      const mod = await import('pdfjs-dist')
      // The worker is a separate module bundle. Resolve its URL at runtime
      // relative to the current module so the bundler emits it as an asset.
      const workerUrl = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
      mod.GlobalWorkerOptions.workerSrc = workerUrl
      return mod
    })()
  }
  return pdfjsModulePromise
}

export type LoadResult = { doc: PDFDocumentProxy }

export async function loadStatement(
  file: File,
  password?: string,
): Promise<LoadResult> {
  const pdfjs = await loadPdfjs()
  const buf = await file.arrayBuffer()
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    password,
    // We don't render, we only read text content.
    disableFontFace: true,
  })
  try {
    const doc = await task.promise
    return { doc }
  } catch (e) {
    const err = e as { name?: string; code?: number; message?: string }
    if (err?.name === 'PasswordException') {
      // code 1 = NEED_PASSWORD, 2 = INCORRECT_PASSWORD per pdf.js
      throw new StatementExtractError(
        err.code === 2 ? { kind: 'wrong_password' } : { kind: 'need_password' },
      )
    }
    if (err?.name === 'InvalidPDFException') {
      throw new StatementExtractError({
        kind: 'invalid_pdf',
        message: err.message ?? 'Invalid PDF',
      })
    }
    throw new StatementExtractError({
      kind: 'unknown',
      message: err?.message ?? 'Failed to open PDF',
    })
  }
}

export async function extractStatementText(doc: PDFDocumentProxy): Promise<string> {
  const pageTexts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const items = content.items.filter(
      (it): it is TextItem => 'str' in it && 'transform' in it,
    )
    pageTexts.push(reconstructPageText(items))
    page.cleanup()
  }
  const joined = pageTexts.join('\n\n---PAGE---\n\n').trim()
  if (joined.length < MIN_CHARS_FOR_TEXT_PDF) {
    throw new StatementExtractError({ kind: 'image_only' })
  }
  return joined
}

// Read a statement as BOTH a text layer and page images — the model consumes
// both (the text is authoritative where present; the images supply whatever the
// text layer drops, and carry a scanned / image-only PDF that has no text at
// all). We therefore always attempt both and only fail when NEITHER yields
// anything. A missing/too-thin text layer is not an error here.
export async function extractStatement(
  doc: PDFDocumentProxy,
): Promise<{ text: string; images: string[] }> {
  let text = ''
  try {
    text = await extractStatementText(doc)
  } catch (e) {
    // Image-only / no text layer is expected for scanned PDFs — the page images
    // carry it. Anything else is a real failure and propagates.
    if (!(e instanceof StatementExtractError && e.detail.kind === 'image_only')) throw e
  }
  const images = await renderStatementImages(doc).catch((): string[] => [])
  if (!text && images.length === 0) {
    throw new StatementExtractError({
      kind: 'unknown',
      message: 'Couldn’t read this PDF — no extractable text or images.',
    })
  }
  return { text, images }
}

function reconstructPageText(items: TextItem[]): string {
  const rows = new Map<number, TextItem[]>()
  for (const it of items) {
    const y = it.transform[5]
    const bucket = Math.round(y / Y_BUCKET_TOLERANCE) * Y_BUCKET_TOLERANCE
    let row = rows.get(bucket)
    if (!row) {
      row = []
      rows.set(bucket, row)
    }
    row.push(it)
  }
  const sortedY = [...rows.keys()].sort((a, b) => b - a) // pdf y grows up
  const lines: string[] = []
  for (const y of sortedY) {
    const row = rows.get(y)!
    row.sort((a, b) => a.transform[4] - b.transform[4])
    let line = ''
    let prevEnd = -Infinity
    for (const it of row) {
      const x = it.transform[4]
      // Insert a gap-space when items are visually separated, otherwise
      // they're glyph-runs in the same word and need direct concatenation.
      if (line && x - prevEnd > 1.5) line += ' '
      line += it.str
      prevEnd = x + (it.width ?? 0)
    }
    const trimmed = line.replace(/\s+/g, ' ').trim()
    if (trimmed) lines.push(trimmed)
  }
  return lines.join('\n')
}

// Render each page to a downscaled JPEG data URL for the vision-model
// extraction path. The decrypted doc already lives in the browser (the
// password was handled client-side), so rendering here avoids shipping the
// PDF + password to the server. Capped width keeps payloads small; vision
// models read 1500px-wide statement scans fine.
export async function renderStatementImages(
  doc: PDFDocumentProxy,
  opts: { maxWidth?: number; quality?: number; maxPages?: number } = {},
): Promise<string[]> {
  const maxWidth = opts.maxWidth ?? 2200
  const quality = opts.quality ?? 0.8
  const maxPages = opts.maxPages ?? MAX_STATEMENT_PAGES
  const images: string[] = []
  const n = Math.min(doc.numPages, maxPages)
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(maxWidth / base.width, 2)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    // White backing — statements are black-on-white; JPEG has no alpha.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    images.push(canvas.toDataURL('image/jpeg', quality))
  }
  return images
}
