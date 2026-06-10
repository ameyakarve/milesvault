'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SectionLabel, StateChip, CenteredState } from '@/components/shared'
import { ledgerClient, isReplaceBufferError } from '@/lib/ledger-client-browser'
import { InboxThreadChat } from './thread-chat'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

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

function parseDrafts(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? v.filter((e): e is string => typeof e === 'string') : []
  } catch {
    return []
  }
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// The capture lifecycle view (ledger-pipeline.md §2): ASYNC arrivals only —
// forwarded transaction emails queue here for review. Chat uploads are
// processed interactively and never enter the Inbox (owner call).
export function InboxView() {
  const [allRows, setAllRows] = useState<CaptureRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  // Inline draft review (async ingestion): which capture is expanded, and
  // per-capture approve state.
  const [openId, setOpenId] = useState<string | null>(null)
  const [approveBusy, setApproveBusy] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/ledger/forwarding-address')
      .then((r) => (r.ok ? (r.json() as Promise<{ address?: string }>) : null))
      .then((d) => !cancelled && d?.address && setAddress(d.address))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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
          r.ok ? (r.json() as Promise<{ rows: CaptureRow[] }>) : Promise.reject(new Error(String(r.status))),
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
      // Only poll while a background draft is pending.
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
  }, [])

  function doRotate() {
    fetch('/api/ledger/forwarding-address', { method: 'POST' })
      .then((r) => (r.ok ? (r.json() as Promise<{ address?: string }>) : null))
      .then((d) => d?.address && setAddress(d.address))
      .catch(() => {})
      .finally(() => setRotateOpen(false))
  }

  const rows = allRows?.filter((r) => r.state !== 'dismissed') ?? null
  const dismissedCount = (allRows?.length ?? 0) - (rows?.length ?? 0)

  function dismiss(id: string) {
    // Optimistic: flip locally, revert on failure.
    setAllRows((prev) => prev?.map((r) => (r.id === id ? { ...r, state: 'dismissed' } : r)) ?? prev)
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

  async function approveDrafts(row: CaptureRow) {
    const entries = parseDrafts(row.drafts)
    if (entries.length === 0) return
    setApproveBusy(row.id)
    setApproveError((s) => {
      const { [row.id]: _drop, ...rest } = s
      return rest
    })
    try {
      // Append-only commit, same contract as chat approval.
      const r = await ledgerClient.replaceBuffer([], entries.join('\n\n'))
      if (isReplaceBufferError(r)) {
        setApproveError((s) => ({ ...s, [row.id]: 'message' in r ? r.message : 'Save conflict' }))
        return
      }
      const post = await fetch('/api/ledger/captures', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id, action: 'post' }),
      }).catch((): null => null)
      if (!post?.ok) {
        // The entries ARE in the journal; only the lifecycle update failed.
        setApproveError((s) => ({
          ...s,
          [row.id]: 'Posted to the journal, but the Inbox state update failed — refresh.',
        }))
      }
      setAllRows((prev) => prev?.map((x) => (x.id === row.id ? { ...x, state: 'posted' } : x)) ?? prev)
      setOpenId(null)
    } finally {
      setApproveBusy(null)
    }
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

  if (error) {
    return <CenteredState tone="error">Could not load the inbox: {error}</CenteredState>
  }
  if (rows === null) {
    return <CenteredState>Loading…</CenteredState>
  }

  const addressLine = address ? (
    <p className="text-xs text-muted-foreground">
      Forward transaction emails (alerts, receipts — no attachments) to{' '}
      <button
        type="button"
        onClick={copyAddress}
        title="Copy address"
        className="font-mono text-foreground hover:underline underline-offset-4"
      >
        {address}
      </button>
      {copied ? <span className="ml-1 text-foreground font-medium">copied</span> : null}
      {' · '}
      <Link href="/inbox/rules" className="text-foreground underline underline-offset-4 hover:no-underline">
        Rules
      </Link>
      {' · '}
      <button
        type="button"
        onClick={() => setRotateOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        title="Burn this address and mint a new one"
      >
        Rotate
      </button>
    </p>
  ) : null

  if (rows.length === 0) {
    return (
      <>
        <CenteredState>
          Nothing to review. Forwarded transaction emails queue here.
        </CenteredState>
        {address ? (
          <div className="mx-auto w-full max-w-2xl px-4 pb-6 text-center">
            {addressLine}
          </div>
        ) : null}
        <RotateDialog open={rotateOpen} onClose={() => setRotateOpen(false)} onConfirm={doRotate} />
      </>
    )
  }

  return (
    <>
      <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-3">
        <SectionLabel>Captured ({rows.length})</SectionLabel>
        <ul className="space-y-2">
          {rows.map((r) => {
            const entries = parseDrafts(r.drafts)
            const open = openId === r.id
            const openable = r.state === 'extracted' || r.state === 'captured'
            return (
              <li
                key={r.id}
                className="rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{r.filename ?? r.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.source} · {fmtDate(r.created_at)}
                      {r.state === 'processing' ? ' · drafting…' : ''}
                    </p>
                    {r.draft_error ? (
                      <p className="mt-0.5 text-xs text-destructive">
                        Background draft failed: {r.draft_error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StateChip tone={chipTone(r.state)}>
                      {r.state === 'processing' ? 'drafting' : r.state}
                    </StateChip>
                    {openable ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setOpenId(open ? null : r.id)}
                        className="text-foreground whitespace-nowrap"
                      >
                        {open ? 'Close' : entries.length > 0 ? `Open (${entries.length})` : 'Open'}
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => dismiss(r.id)}
                      className="text-muted-foreground whitespace-nowrap"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
                {open && openable ? (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    {entries.map((e, i) => (
                      <pre
                        key={i}
                        className="overflow-x-auto rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs leading-5 text-foreground"
                      >
                        {e}
                      </pre>
                    ))}
                    {approveError[r.id] ? (
                      <p className="text-xs text-destructive">{approveError[r.id]}</p>
                    ) : null}
                    {entries.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <Button
                          size="xs"
                          onClick={() => void approveDrafts(r)}
                          disabled={approveBusy === r.id}
                        >
                          {approveBusy === r.id ? 'Posting…' : `Approve all (${entries.length})`}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Edits or questions? Chat below — it knows this statement.
                        </p>
                      </div>
                    ) : null}
                    <InboxThreadChat
                      captureId={r.id}
                      onPosted={() => {
                        setAllRows(
                          (prev) =>
                            prev?.map((x) => (x.id === r.id ? { ...x, state: 'posted' } : x)) ??
                            prev,
                        )
                        setOpenId(null)
                      }}
                    />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          Dropped statements and forwarded transaction emails are drafted in
          the background and reviewed here.
          {dismissedCount > 0 ? ` ${dismissedCount} dismissed item${dismissedCount === 1 ? '' : 's'} hidden.` : ''}
        </p>
        {addressLine}
      </div>
      <RotateDialog open={rotateOpen} onClose={() => setRotateOpen(false)} onConfirm={doRotate} />
    </>
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate forwarding address?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The current address stops working immediately. Any emails sent to the old address will be lost.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Rotate address</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
