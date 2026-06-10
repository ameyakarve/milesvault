'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SectionLabel, StateChip, CenteredState } from '@/components/shared'
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
  created_at: number
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

  useEffect(() => {
    let cancelled = false
    fetch('/api/ledger/captures')
      .then((r) =>
        r.ok ? (r.json() as Promise<{ rows: CaptureRow[] }>) : Promise.reject(new Error(String(r.status))),
      )
      .then((d) => !cancelled && setAllRows(d.rows ?? []))
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
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

  // Chip tone mapping: captured→pending, extracted→active, posted→positive, dismissed→neutral
  function chipTone(state: string) {
    if (state === 'captured') return 'pending' as const
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
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{r.filename ?? r.id}</p>
                <p className="text-xs text-muted-foreground">
                  {r.source} · {fmtDate(r.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StateChip tone={chipTone(r.state)}>{r.state}</StateChip>
                <Link
                  href={`/editor?statement=${encodeURIComponent(r.id)}&filename=${encodeURIComponent(r.filename ?? r.id)}${r.prompt ? `&prompt=${encodeURIComponent(r.prompt)}` : ''}`}
                  className="text-xs text-foreground underline underline-offset-4 hover:no-underline whitespace-nowrap"
                >
                  Review in chat →
                </Link>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => dismiss(r.id)}
                  className="text-muted-foreground whitespace-nowrap"
                >
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Uploads and forwarded transaction emails are captured here.
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
