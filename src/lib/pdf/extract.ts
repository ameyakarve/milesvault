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

// pdf.js groups text into TextItems with `transform = [a,b,c,d,e,f]` where
// (e,f) is the baseline origin. We bucket items by integer Y and sort by X
// to reconstruct rows — this preserves table layout well enough for most
// statements without proper layout analysis.
const Y_BUCKET_TOLERANCE = 3

type LoadedPdfjs = typeof import('pdfjs-dist')

let pdfjsModulePromise: Promise<LoadedPdfjs> | null = null

async function loadPdfjs(): Promise<LoadedPdfjs> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
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
