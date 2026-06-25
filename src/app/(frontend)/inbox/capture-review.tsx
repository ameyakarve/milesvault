'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Loader2, Mail } from 'lucide-react'
import { SectionLabel, StateChip, CenteredState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useAgent } from 'agents/react'
import type { ChatDOState } from '@/durable/chat-do'
import { StatementUploadModal } from '@/components/statement-upload-modal'
import { DraftChat } from '@/app/(frontend)/_chat/draft-chat'

type CaptureRow = {
  id: string
  source: string
  artifact: string | null
  filename: string | null
  state: string
  prompt: string | null
  drafts: string | null
  draft_error: string | null
  created_at: number
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Chip tone mapping: captured→neutral (queued), processing→pending,
// extracted→active (ready to review), posted→positive
function chipTone(state: string) {
  if (state === 'captured') return 'neutral' as const
  if (state === 'processing') return 'pending' as const
  if (state === 'extracted') return 'active' as const
  if (state === 'posted') return 'positive' as const
  return 'neutral' as const
}

function chipLabel(state: string): string {
  return state === 'processing' ? 'drafting' : state
}

// The capture review workspace — same anatomy as the editor: a bordered
// header strip, a list rail, and a detail pane. One component, two
// homes (owner split): `source='upload'` is the Statements page (paperclip /
// drop imports + the upload button); `source='email'` is the Inbox (forwarded
// mail + the forwarding-address controls). Each shows only its own captures.
// A capture is CONSUMED on the first approve or delete: it leaves the active
// list and the pane returns to the queue — the surface is a one-shot import,
// not a place to keep editing.
export function CaptureReview({ source }: { source: 'upload' | 'email' }) {
  const isEmail = source === 'email'
  const title = isEmail ? 'Inbox' : 'Statements'
  const [allRows, setAllRows] = useState<CaptureRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [dismissAllOpen, setDismissAllOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Transient error for list-level mutations (delete / rotate), shown inline.
  const [actionError, setActionError] = useState<string | null>(null)
  // Bumped by the load-error retry to re-run the list fetch.
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    if (!isEmail) return
    let cancelled = false
    fetch('/api/ledger/forwarding-address')
      .then((r) => (r.ok ? (r.json() as Promise<{ address?: string }>) : null))
      .then((d) => !cancelled && d?.address && setAddress(d.address))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isEmail])

  function copyAddress() {
    if (!address) return
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // Live list: load on mount, reload when the global drop captures something
  // or the tab regains focus, and poll while anything is still drafting so
  // captured → extracted appears without a manual reload.
  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/ledger/captures')
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ rows: CaptureRow[] }>)
            : Promise.reject(new Error(String(r.status))),
        )
        .then((d) => {
          if (cancelled) return
          setAllRows(d.rows ?? [])
          setError(null)
        })
        .catch((e) => !cancelled && setError(String(e)))
    }
    load()
    const onCaptured = () => load()
    const onFocus = () => load()
    window.addEventListener('mv:captured', onCaptured)
    window.addEventListener('focus', onFocus)
    const interval = setInterval(() => {
      setAllRows((prev) => {
        if (prev?.some((r) => r.state === 'captured' || r.state === 'processing')) load()
        return prev
      })
    }, 8000)
    return () => {
      cancelled = true
      window.removeEventListener('mv:captured', onCaptured)
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [reloadNonce])

  function doRotate() {
    setActionError(null)
    fetch('/api/ledger/forwarding-address', { method: 'POST' })
      .then((r) => (r.ok ? (r.json() as Promise<{ address?: string }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => d?.address && setAddress(d.address))
      .catch(() => setActionError('Could not rotate the forwarding address. Try again.'))
      .finally(() => setRotateOpen(false))
  }

  // Only this home's captures, and only the still-actionable ones: a posted
  // (approved) or dismissed item is consumed — it drops out of the queue.
  const sourceRows = useMemo(
    () => allRows?.filter((r) => r.source === source) ?? null,
    [allRows, source],
  )
  const rows = useMemo(
    () => sourceRows?.filter((r) => r.state !== 'dismissed' && r.state !== 'posted') ?? null,
    [sourceRows],
  )
  const dismissedCount = (sourceRows?.length ?? 0) - (rows?.length ?? 0)
  const selected = rows?.find((r) => r.id === selectedId) ?? null

  function deleteItem(id: string) {
    // Optimistic remove; snapshot the full list so a failure restores order.
    let snapshot: CaptureRow[] | null = null
    setAllRows((prev) => {
      snapshot = prev
      return prev?.filter((r) => r.id !== id) ?? prev
    })
    const wasSelected = selectedId === id
    if (wasSelected) setSelectedId(null)
    setActionError(null)
    fetch('/api/ledger/captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, action: 'delete' }),
    })
      .then((r) => (r.ok ? null : Promise.reject(new Error(String(r.status)))))
      .catch(() => {
        // Revert: a permanent delete must not vanish on a transient failure.
        setAllRows(snapshot)
        if (wasSelected) setSelectedId(id)
        setActionError('Could not delete that item — it has been restored. Try again.')
      })
  }

  function redraft(id: string) {
    setAllRows(
      (prev) =>
        prev?.map((r) =>
          r.id === id ? { ...r, state: 'processing', draft_error: null } : r,
        ) ?? prev,
    )
    fetch('/api/ledger/captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, action: 'redraft' }),
    }).catch(() => {})
  }

  function dismiss(id: string) {
    // Optimistic: flip locally, revert on failure.
    setAllRows((prev) => prev?.map((r) => (r.id === id ? { ...r, state: 'dismissed' } : r)) ?? prev)
    if (selectedId === id) setSelectedId(null)
    fetch('/api/ledger/captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, action: 'dismiss' }),
    })
      .then((r) => (r.ok ? null : Promise.reject(new Error(String(r.status)))))
      .catch(() => {
        setAllRows((prev) => prev?.map((r) => (r.id === id ? { ...r, state: 'captured' } : r)) ?? prev)
      })
  }

  // Clear the whole review queue in one go: flip every still-actionable item
  // to dismissed optimistically, then fan the per-item dismiss POSTs out in
  // parallel (the endpoint takes one id). On any failure we don't try to
  // un-pick which id bounced — we just re-fetch so the list reconciles to the
  // server's truth (succeeded ones stay hidden, failed ones reappear).
  function dismissAll() {
    const ids = rows?.map((r) => r.id) ?? []
    if (ids.length === 0) return
    const idSet = new Set(ids)
    setAllRows((prev) => prev?.map((r) => (idSet.has(r.id) ? { ...r, state: 'dismissed' } : r)) ?? prev)
    setSelectedId(null)
    setActionError(null)
    Promise.all(
      ids.map((id) =>
        fetch('/api/ledger/captures', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, action: 'dismiss' }),
        }).then((r) => (r.ok ? null : Promise.reject(new Error(id)))),
      ),
    ).catch(() => {
      setActionError('Some items could not be dismissed — refreshing the list.')
      setReloadNonce((n) => n + 1)
    })
  }

  function openItem(row: CaptureRow) {
    setSelectedId(row.id)
  }

  if (error) {
    return (
      <CenteredState tone="error" onRetry={() => setReloadNonce((n) => n + 1)}>
        Could not load the {isEmail ? 'inbox' : 'statements'}: {error}
      </CenteredState>
    )
  }
  if (rows === null) {
    return <CenteredState>Loading…</CenteredState>
  }

  const addressLine = isEmail && address ? (
    <p className="text-xs leading-5 text-muted-foreground">
      Forward transaction emails to{' '}
      <button
        type="button"
        onClick={copyAddress}
        title="Copy address"
        className="font-mono text-foreground hover:underline underline-offset-4"
      >
        {address}
      </button>
      {copied ? <span className="ml-1 font-medium text-foreground">copied</span> : null}
      {' · '}
      <button
        type="button"
        onClick={() => setRotateOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        title="Burn this address and mint a new one"
      >
        Rotate
      </button>
      {dismissedCount > 0 ? ` · ${dismissedCount} dismissed hidden` : ''}
    </p>
  ) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <SectionLabel>
          {title}
          {rows.length > 0 ? ` · ${rows.length} to review` : ''}
        </SectionLabel>
        <div className="flex shrink-0 items-center gap-2">
          {rows.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissAllOpen(true)}
              className="text-muted-foreground"
            >
              Dismiss all
            </Button>
          ) : null}
          {source === 'upload' ? (
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              Upload statement
            </Button>
          ) : null}
        </div>
      </header>

      {actionError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive sm:px-6"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 underline underline-offset-2 hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
          <p className="text-sm text-muted-foreground">
            {isEmail
              ? 'Nothing to review. Forwarded emails queue here.'
              : 'Nothing to review. Upload a statement or drop a PDF to import it.'}
          </p>
          {addressLine ? <div className="max-w-md text-center">{addressLine}</div> : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* List rail — hidden on mobile while an item is open */}
          <aside
            className={`${selected ? 'hidden md:flex' : 'flex'} w-full min-h-0 flex-col border-border md:w-80 md:shrink-0 md:border-r`}
          >
            <ul className="min-h-0 flex-1 overflow-y-auto py-1">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => openItem(r)}
                    className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none ${
                      selectedId === r.id ? 'bg-muted' : ''
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {r.filename ?? r.id}
                      </span>
                      <StateChip tone={chipTone(r.state)}>{chipLabel(r.state)}</StateChip>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.source} · {fmtDate(r.created_at)}
                    </span>
                    {r.draft_error ? (
                      <span className="text-xs text-destructive">
                        Background draft failed
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            {addressLine ? (
              <div className="border-t border-border px-4 py-3">{addressLine}</div>
            ) : null}
          </aside>

          {/* Detail pane */}
          <section
            className={`${selected ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col`}
          >
            {!selected ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted-foreground">Select an item to review.</p>
              </div>
            ) : (
              <ItemDetail
                key={selected.id}
                row={selected}
                onDismiss={() => dismiss(selected.id)}
                onDelete={() => deleteItem(selected.id)}
                onRedraft={() => redraft(selected.id)}
                onBack={() => setSelectedId(null)}
                onPosted={() => {
                  setAllRows(
                    (prev) =>
                      prev?.map((x) =>
                        x.id === selected.id ? { ...x, state: 'posted' } : x,
                      ) ?? prev,
                  )
                  setSelectedId(null)
                }}
              />
            )}
          </section>
        </div>
      )}

      <StatementUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <RotateDialog open={rotateOpen} onClose={() => setRotateOpen(false)} onConfirm={doRotate} />
      <DismissAllDialog
        open={dismissAllOpen}
        count={rows.length}
        isEmail={isEmail}
        onClose={() => setDismissAllOpen(false)}
        onConfirm={() => {
          dismissAll()
          setDismissAllOpen(false)
        }}
      />
    </div>
  )
}

function DismissAllDialog({
  open,
  count,
  isEmail,
  onClose,
  onConfirm,
}: {
  open: boolean
  count: number
  isEmail: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const noun = isEmail ? 'email' : 'item'
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Dismiss all {count} {noun}
            {count === 1 ? '' : 's'}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This clears the review queue — every {noun} here is hidden and won&rsquo;t be
          posted to your journal. Nothing is deleted; this just removes the clutter
          while you decide what to keep.
        </p>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Dismiss all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ItemDetail({
  row,
  onDismiss,
  onDelete,
  onRedraft,
  onBack,
  onPosted,
}: {
  row: CaptureRow
  onDismiss: () => void
  onDelete: () => void
  onRedraft: () => void
  onBack: () => void
  onPosted: () => void
}) {
  // "View email" — lazily fetch the stored body the first time it's opened
  // (too large for the list poll). Only forwarded emails have a body worth
  // showing (e.g. to grab a verification link); uploads don't.
  const isEmail = row.source === 'email'
  const [bodyOpen, setBodyOpen] = useState(false)
  const [body, setBody] = useState<string | null>(null)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [bodyError, setBodyError] = useState(false)

  async function toggleBody() {
    const next = !bodyOpen
    setBodyOpen(next)
    if (next && body === null && !bodyLoading) {
      setBodyLoading(true)
      setBodyError(false)
      try {
        const res = await fetch(`/api/ledger/captures/${encodeURIComponent(row.id)}`)
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { text?: string }
        setBody(data.text ?? '')
      } catch {
        setBodyError(true)
      } finally {
        setBodyLoading(false)
      }
    }
  }

  // Show the full DraftChat when the draft is extracted (ready), or for any
  // state where there may already be chat history from a prior session.
  // For still-in-flight states (captured/processing) we show a status panel
  // as the emptyState so the user sees progress — DraftChat still mounts and
  // will connect once the DO is ready, but the status panel surfaces when the
  // conversation is blank.
  const showChat = row.state === 'extracted' || row.state === 'posted'

  // Status panel to render as DraftChat's emptyState for non-extracted items.
  const lifecyclePanel = (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      {row.state === 'processing' || row.state === 'captured' ? (
        <>
          {row.draft_error ? (
            <>
              <p className="text-sm text-foreground">Background draft failed</p>
              <p className="max-w-md text-xs text-destructive">{row.draft_error}</p>
            </>
          ) : (
            <>
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {row.state === 'processing'
                  ? 'Drafting in the background…'
                  : 'Queued for drafting…'}
              </p>
              <DraftTrace captureId={row.id} />
            </>
          )}
          {row.draft_error || row.state === 'captured' ? (
            <div className="mt-1 flex items-center gap-2">
              <Button size="sm" onClick={onRedraft}>
                Retry draft
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                className="text-destructive hover:text-destructive"
              >
                Delete
              </Button>
            </div>
          ) : null}
        </>
      ) : row.state === 'posted' ? (
        <p className="text-sm text-muted-foreground">
          Posted to the journal. Dismiss to clear it from the list.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing to review here yet.</p>
      )}
    </div>
  )

  return (
    <>
      {/* Item header — meta left, actions right */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none md:hidden"
            aria-label="Back to list"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {row.filename ?? row.id}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.source} · {fmtDate(row.created_at)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StateChip tone={chipTone(row.state)}>{chipLabel(row.state)}</StateChip>
          {isEmail ? (
            <Button
              size="sm"
              variant={bodyOpen ? 'secondary' : 'ghost'}
              onClick={toggleBody}
              className="gap-1.5 text-muted-foreground"
            >
              <Mail className="size-4" />
              {bodyOpen ? 'Hide email' : 'View email'}
            </Button>
          ) : null}
          {(row.state === 'failed' || row.draft_error) ? (
            <Button size="sm" onClick={onRedraft}>
              Retry draft
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            className="text-muted-foreground"
          >
            Dismiss
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Email body — collapsible, lazily loaded. Handy for verification links
          and seeing exactly what was forwarded next to the extracted draft. */}
      {isEmail && bodyOpen ? (
        <div className="border-b border-border bg-muted/30 px-4 py-3 sm:px-6">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Email body
          </p>
          {bodyLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : bodyError ? (
            <p className="text-sm text-destructive">Couldn&rsquo;t load the email body.</p>
          ) : (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
              {body}
            </pre>
          )}
        </div>
      ) : null}

      {/* Chat pane — fills the remaining height. For extracted items this is
          the full rich DraftChat (approval happens in-chat via the draft card).
          For still-in-flight items we show the lifecycle status panel as the
          empty state so the user sees progress while the DO drafts. */}
      {showChat ? (
        <DraftChat
          agentOptions={{
            agent: 'ChatDO',
            basePath: 'api/agents/editor',
            query: { thread: row.id },
          }}
          onCommitted={async () => {
            const post = await fetch('/api/ledger/captures', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id: row.id, action: 'post' }),
            }).catch((): null => null)
            if (post?.ok) {
              onPosted()
            }
          }}
          placeholder="Ask about this statement…"
        />
      ) : (
        <DraftChat
          agentOptions={{
            agent: 'ChatDO',
            basePath: 'api/agents/editor',
            query: { thread: row.id },
          }}
          onCommitted={async () => {
            const post = await fetch('/api/ledger/captures', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id: row.id, action: 'post' }),
            }).catch((): null => null)
            if (post?.ok) {
              onPosted()
            }
          }}
          placeholder="Ask about this statement…"
          emptyState={() => lifecyclePanel}
        />
      )}
    </>
  )
}

// One socket, only when a still-drafting item is selected (owner rule:
// the Inbox list connects nothing). Reads the per-capture DO's live
// draftProgress via Think's state-sync primitive — no polling, no
// reinvented channel.
function DraftTrace({ captureId }: { captureId: string }) {
  const agent = useAgent<ChatDOState>({
    agent: 'ChatDO',
    basePath: 'api/agents/editor',
    query: { thread: captureId },
  })
  const ref = useRef<HTMLPreElement>(null)
  const trace = agent.state?.draftProgress
  // Keep the newest output in view as it streams.
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [trace])
  if (!trace) return null
  return (
    <pre
      ref={ref}
      className="mt-2 h-64 w-full max-w-xl overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/50 px-3 py-2 text-left font-mono text-xs leading-5 text-muted-foreground"
    >
      {trace}
    </pre>
  )
}

function RotateDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rotate forwarding address?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The current address stops working immediately. Update any forwarding
          rules you have set up in your mail client.
        </p>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Rotate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
