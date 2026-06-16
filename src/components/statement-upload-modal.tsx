'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { FileText, Loader2, Lock, Upload } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  loadStatement,
  extractStatementText,
  renderStatementImages,
  MAX_STATEMENT_BYTES,
  StatementExtractError,
} from '@/lib/pdf/extract'
import { ledgerClient } from '@/lib/ledger-client-browser'

type ModalState =
  | { kind: 'idle' }
  | { kind: 'extracting'; file: File }
  | { kind: 'needs_password'; file: File; wrong?: boolean }
  | { kind: 'captured'; file: File }
  | { kind: 'error'; file: File | null; message: string }

// The one way to upload a statement by hand (owner decree: statements are
// Inbox items, never chat content). Extraction and password unlock happen
// in-browser; the server receives text only; the capture row + background
// draft are created by /api/statements with mode 'inbox'.
export function StatementUploadModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [state, setState] = useState<ModalState>({ kind: 'idle' })
  const [pw, setPw] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)

  async function process(file: File, password?: string) {
    setState({ kind: 'extracting', file })
    try {
      const { doc } = await loadStatement(file, password)
      const text = await extractStatementText(doc)
      const images = await renderStatementImages(doc).catch((): string[] => [])
      await ledgerClient.attachStatement({ mode: 'inbox', filename: file.name, text, images })
      window.dispatchEvent(new CustomEvent('mv:captured'))
      setState({ kind: 'captured', file })
    } catch (e) {
      if (e instanceof StatementExtractError) {
        if (e.detail.kind === 'need_password' || e.detail.kind === 'wrong_password') {
          setPw('')
          setState({
            kind: 'needs_password',
            file,
            wrong: e.detail.kind === 'wrong_password',
          })
          return
        }
        setState({
          kind: 'error',
          file,
          message:
            e.detail.kind === 'image_only'
              ? 'Image-only PDF — text extraction not supported yet.'
              : e.detail.message,
        })
        return
      }
      setState({ kind: 'error', file, message: e instanceof Error ? e.message : String(e) })
    }
  }

  function pick(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setState({ kind: 'error', file: null, message: 'PDF statements only.' })
      return
    }
    if (file.size > MAX_STATEMENT_BYTES) {
      setState({
        kind: 'error',
        file: null,
        message: `That file is too large (max ${Math.round(MAX_STATEMENT_BYTES / 1024 / 1024)} MB).`,
      })
      return
    }
    void process(file)
  }

  function close() {
    setState({ kind: 'idle' })
    setPw('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload a statement</DialogTitle>
        </DialogHeader>

        {state.kind === 'idle' || state.kind === 'error' ? (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragging(false)
              pick(e.dataTransfer?.files ?? null)
            }}
            className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
              dragging ? 'border-foreground bg-muted' : 'border-border'
            }`}
          >
            <Upload className="size-6 text-muted-foreground" />
            <p className="text-sm text-foreground">Drop a PDF here, or</p>
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              Browse…
            </Button>
            <p className="text-xs text-muted-foreground">
              It goes to your Inbox and drafts in the background — the chat is
              never involved.
            </p>
            {state.kind === 'error' ? (
              <p className="text-xs text-destructive">{state.message}</p>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        ) : state.kind === 'extracting' ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Loader2 className="size-6 animate-spin text-foreground" />
            <p className="text-sm text-foreground">Reading {state.file.name}…</p>
          </div>
        ) : state.kind === 'needs_password' ? (
          <form
            className="flex flex-col items-center gap-3 px-6 py-8 text-center"
            onSubmit={(e) => {
              e.preventDefault()
              if (pw) void process(state.file, pw)
            }}
          >
            <Lock className="size-5 text-muted-foreground" />
            <p className="text-sm text-foreground">{state.file.name} is locked</p>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus
              placeholder={state.wrong ? 'Wrong password — try again' : 'PDF password'}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/40"
            />
            <p className="text-xs text-muted-foreground">
              Decrypted in your browser — only the text is sent. The password is
              never stored.
            </p>
            <Button size="sm" type="submit" disabled={!pw}>
              Unlock &amp; capture
            </Button>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <FileText className="size-6 text-foreground" />
            <p className="text-sm font-medium text-foreground">
              {state.file.name} captured
            </p>
            <p className="text-xs text-muted-foreground">
              Drafting in the background — review it from Statements.
            </p>
            <div className="flex items-center gap-2">
              <Link
                href="/statements"
                onClick={close}
                className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background"
              >
                Open Statements
              </Link>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setState({ kind: 'idle' })}
              >
                Upload another
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
