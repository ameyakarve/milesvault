'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2 } from 'lucide-react'
import {
  loadStatement,
  extractStatementText,
  renderStatementImages,
  MAX_STATEMENT_BYTES,
  StatementExtractError,
} from '@/lib/pdf/extract'
import { ledgerClient } from '@/lib/ledger-client-browser'

type OverlayState =
  | { kind: 'idle' }
  | { kind: 'dragging' }
  | { kind: 'processing'; filename: string }
  | { kind: 'needs_password'; file: File; wrong: boolean }
  | { kind: 'captured'; filename: string }
  | { kind: 'error'; message: string }

// How long to show error notices before auto-dismissing.
const ERROR_DISMISS_MS = 4000

// Count open dragleave events vs dragenter so we can distinguish "left the
// window" from "moved between child elements."
function useDragOver(): {
  isDragging: boolean
  onDragEnter: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  reset: () => void
} {
  const depth = useRef(0)
  const [isDragging, setIsDragging] = useState(false)

  function onDragEnter(e: DragEvent) {
    // Only activate for file drags.
    if (!hasFiles(e)) return
    depth.current += 1
    if (depth.current === 1) setIsDragging(true)
  }

  function onDragLeave(_e: DragEvent) {
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setIsDragging(false)
  }

  function reset() {
    depth.current = 0
    setIsDragging(false)
  }

  return { isDragging, onDragEnter, onDragLeave, reset }
}

function hasFiles(e: DragEvent): boolean {
  if (!e.dataTransfer) return false
  // During dragenter/dragover the `files` list is empty; check `types`.
  return Array.from(e.dataTransfer.types).includes('Files')
}

export function GlobalCapture() {
  const router = useRouter()
  const { isDragging, onDragEnter, onDragLeave, reset } = useDragOver()
  const [overlay, setOverlay] = useState<OverlayState>({ kind: 'idle' })
  const processingRef = useRef(false)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {

    function handleDragEnter(e: DragEvent) {
      e.preventDefault()
      onDragEnter(e)
    }

    function handleDragOver(e: DragEvent) {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    function handleDragLeave(e: DragEvent) {
      onDragLeave(e)
    }

    function handleDrop(e: DragEvent) {
      e.preventDefault()
      e.stopPropagation()
      reset()
      if (processingRef.current) return
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      if (files.length > 1) {
        showError('Drop a single PDF statement.')
        return
      }

      const file = files[0]!
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        showError('PDF statements only.')
        return
      }
      if (file.size > MAX_STATEMENT_BYTES) {
        showError(`That file is too large (max ${Math.round(MAX_STATEMENT_BYTES / 1024 / 1024)} MB).`)
        return
      }

      void processFile(file)
    }

    // Capture phase: this runs before any bubbling listener inside the page
    // (the chat form attaches its own drop handlers), so a statement drop is
    // ALWAYS an Inbox capture — on every page, the editor included.
    window.addEventListener('dragenter', handleDragEnter, true)
    window.addEventListener('dragover', handleDragOver, true)
    window.addEventListener('dragleave', handleDragLeave, true)
    window.addEventListener('drop', handleDrop, true)
    return () => {
      window.removeEventListener('dragenter', handleDragEnter, true)
      window.removeEventListener('dragover', handleDragOver, true)
      window.removeEventListener('dragleave', handleDragLeave, true)
      window.removeEventListener('drop', handleDrop, true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync drag-counter state into overlay.
  useEffect(() => {
    if (isDragging && overlay.kind === 'idle') {
      setOverlay({ kind: 'dragging' })
    } else if (!isDragging && overlay.kind === 'dragging') {
      setOverlay({ kind: 'idle' })
    }
  }, [isDragging, overlay.kind])

  function showError(message: string) {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    setOverlay({ kind: 'error', message })
    errorTimerRef.current = setTimeout(() => {
      setOverlay({ kind: 'idle' })
    }, ERROR_DISMISS_MS)
  }

  async function processFile(file: File, password?: string) {
    processingRef.current = true
    setOverlay({ kind: 'processing', filename: file.name })
    try {
      const { doc } = await loadStatement(file, password)
      const text = await extractStatementText(doc)
      // Async ingestion (owner call): capture to the Inbox and draft in the
      // background — never block the user on a statement.
      await ledgerClient.attachStatement({ mode: 'inbox', filename: file.name, text })
      setOverlay({ kind: 'captured', filename: file.name })
      window.dispatchEvent(new CustomEvent('mv:captured'))
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      errorTimerRef.current = setTimeout(() => setOverlay({ kind: 'idle' }), ERROR_DISMISS_MS)
      router.refresh()
    } catch (e) {
      if (e instanceof StatementExtractError) {
        if (e.detail.kind === 'need_password' || e.detail.kind === 'wrong_password') {
          // Decryption happens in-browser; the password is used once by
          // pdf.js and never stored or sent — the server sees text only.
          setOverlay({
            kind: 'needs_password',
            file,
            wrong: e.detail.kind === 'wrong_password',
          })
          return
        }
        if (e.detail.kind === 'image_only') {
          showError('Image-only PDF — text extraction not supported yet.')
          return
        }
        showError(e.detail.kind === 'invalid_pdf' || e.detail.kind === 'unknown' ? e.detail.message : 'Failed to read PDF.')
        return
      }
      showError(e instanceof Error ? e.message : 'Failed to read PDF.')
    } finally {
      processingRef.current = false
    }
  }

  // Nothing to render when idle and not dragging.
  if (overlay.kind === 'idle') return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-foreground/20">
      <div className="flex w-72 flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/95 p-8 shadow-2xl text-center">
        {overlay.kind === 'dragging' ? (
          <>
            <FileText className="size-8 text-foreground" />
            <p className="text-[15px] font-semibold text-foreground">
              Drop a statement PDF to capture it
            </p>
            <p className="text-xs text-muted-foreground">
              We’ll draft it in the background — review from the Inbox
            </p>
          </>
        ) : overlay.kind === 'processing' ? (
          <>
            <Loader2 className="size-8 animate-spin text-foreground" />
            <p className="text-[15px] font-semibold text-foreground">
              Reading {overlay.filename}…
            </p>
          </>
        ) : overlay.kind === 'needs_password' ? (
          <form
            className="flex w-full flex-col items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const input = e.currentTarget.elements.namedItem('pdf-password') as HTMLInputElement | null
              const pw = input?.value ?? ''
              if (!pw) return
              const file = overlay.file
              void processFile(file, pw)
            }}
          >
            <FileText className="size-8 text-foreground" />
            <p className="text-[15px] font-semibold text-foreground">
              {overlay.file.name} is locked
            </p>
            <input
              name="pdf-password"
              type="password"
              autoFocus
              placeholder={overlay.wrong ? 'Wrong password — try again' : 'PDF password'}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/40"
            />
            <p className="text-xs text-muted-foreground">
              Decrypted in your browser — only the text is sent. The password is never stored.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background"
              >
                Unlock & capture
              </button>
              <button
                type="button"
                onClick={() => setOverlay({ kind: 'idle' })}
                className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : overlay.kind === 'captured' ? (
          <>
            <FileText className="size-8 text-foreground" />
            <p className="text-[15px] font-semibold text-foreground">
              {overlay.filename} captured
            </p>
            <p className="text-xs text-muted-foreground">
              Drafting in the background — it’ll appear in your Inbox
            </p>
          </>
        ) : overlay.kind === 'error' ? (
          <>
            <p className="text-[15px] font-semibold text-destructive">
              {overlay.message}
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
