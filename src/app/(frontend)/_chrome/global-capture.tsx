'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { FileText, Loader2 } from 'lucide-react'
import {
  loadStatement,
  extractStatementText,
  StatementExtractError,
} from '@/lib/pdf/extract'
import { ledgerClient } from '@/lib/ledger-client-browser'

type OverlayState =
  | { kind: 'idle' }
  | { kind: 'dragging' }
  | { kind: 'processing'; filename: string }
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
  const pathname = usePathname()
  const router = useRouter()
  const { isDragging, onDragEnter, onDragLeave, reset } = useDragOver()
  const [overlay, setOverlay] = useState<OverlayState>({ kind: 'idle' })
  const processingRef = useRef(false)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Suppress entirely on /editor — the chat tab has its own attach flow and
  // the auto-send ?statement= param would conflict with an in-progress chat.
  const suppress = !!pathname?.startsWith('/editor')

  useEffect(() => {
    if (suppress) return

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

      void processFile(file)
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppress])

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

  async function processFile(file: File) {
    processingRef.current = true
    setOverlay({ kind: 'processing', filename: file.name })
    try {
      const { doc } = await loadStatement(file)
      const text = await extractStatementText(doc)
      // Async ingestion (owner call): capture to the Inbox and draft in the
      // background — never block the user on a statement.
      await ledgerClient.attachStatement({ mode: 'inbox', filename: file.name, text })
      setOverlay({ kind: 'captured', filename: file.name })
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      errorTimerRef.current = setTimeout(() => setOverlay({ kind: 'idle' }), ERROR_DISMISS_MS)
      router.refresh()
    } catch (e) {
      if (e instanceof StatementExtractError) {
        if (e.detail.kind === 'need_password' || e.detail.kind === 'wrong_password') {
          showError('This PDF needs a password — use the paperclip in the Journal chat.')
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
