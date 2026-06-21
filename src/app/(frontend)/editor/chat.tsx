'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Paperclip, Scale } from 'lucide-react'
import Link from 'next/link'
import { StatementUploadModal } from '@/components/statement-upload-modal'
import { AddAccountsModal } from '@/components/add-accounts-modal'
import { UpdateBalanceModal } from '@/components/update-balance-modal'
import { ledgerClient } from '@/lib/ledger-client-browser'
import { DraftChat } from '@/app/(frontend)/_chat/draft-chat'

export function Chat({
  onBusyChange,
  onClearableChange,
  onAppended,
  onShowInJournal,
}: {
  onBusyChange?: (busy: boolean) => void
  onClearableChange?: (state: { canClear: boolean; clear: () => void }) => void
  onAppended?: () => void
  // Opens the Journal filtered to a date range (split pane / tab switch).
  onShowInJournal?: (range: { from: string; to: string } | null) => void
} = {}) {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [addCardOpen, setAddCardOpen] = useState(false)
  const [updateBalanceOpen, setUpdateBalanceOpen] = useState(false)

  function refreshAccounts() {
    return ledgerClient.getAccounts().catch(() => {})
  }

  const chip =
    'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none'

  const composerExtras = (
    <>
      {/* Labeled actions ABOVE the input, always present (owner call) —
          not unlabeled icons buried in the footer. Wrap on narrow phones. */}
      <button type="button" onClick={() => setUploadOpen(true)} className={chip}>
        <Paperclip className="size-3.5" />
        Upload statement
      </button>
      <button type="button" onClick={() => setAddCardOpen(true)} className={chip}>
        <CreditCard className="size-3.5" />
        Add accounts
      </button>
      <button type="button" onClick={() => setUpdateBalanceOpen(true)} className={chip}>
        <Scale className="size-3.5" />
        Update balance
      </button>
    </>
  )

  return (
    <>
      <StatementUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <AddAccountsModal
        open={addCardOpen}
        onClose={() => setAddCardOpen(false)}
        onDone={() => {
          void refreshAccounts()
          onAppended?.()
        }}
      />
      <UpdateBalanceModal
        open={updateBalanceOpen}
        onClose={() => setUpdateBalanceOpen(false)}
        onDone={() => {
          void refreshAccounts()
          onAppended?.()
        }}
      />
      <DraftChat
        agentOptions={{ agent: 'ChatDO', basePath: 'api/agents/editor' }}
        autoPrefill
        onBusyChange={onBusyChange}
        onClearableChange={onClearableChange}
        onAppended={onAppended}
        onShowInJournal={onShowInJournal}
        composerExtras={composerExtras}
        emptyState={(composer) => (
          <div className="flex flex-1 items-center justify-center px-4">
            <div className="flex w-full max-w-3xl -translate-y-8 flex-col items-center gap-7">
              <h1 className="text-3xl font-semibold tracking-tight">
                How can I help?
              </h1>
              <div className="flex w-full flex-col gap-3">
                {composer}
              </div>
              <PendingCapturesHint />
            </div>
          </div>
        )}
        footerNote="MilesVault can make mistakes. Check important info."
        onCommitted={async () => {
          onAppended?.()
        }}
      />
    </>
  )
}

// Returning users with Inbox work get pointed at it from the empty chat.
function PendingCapturesHint() {
  const [pending, setPending] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch('/api/ledger/captures')
      .then((r) => (r.ok ? (r.json() as Promise<{ rows?: Array<{ state: string; draft_error: string | null }> }>) : null))
      .then((d) => {
        if (cancelled || !d) return
        // Only items ready for the user — drafts extracted, or a failed
        // background draft. Still-drafting (captured/processing) doesn't count.
        setPending(
          (d.rows ?? []).filter((c) => (c.state === 'extracted' || (c.draft_error != null && c.state !== 'posted' && c.state !== 'dismissed'))).length,
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  if (pending === 0) return null
  return (
    <Link
      href="/inbox"
      className="rounded-full border border-amber-200/60 bg-amber-50 px-3 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
    >
      {pending} item{pending === 1 ? '' : 's'} waiting in the Inbox →
    </Link>
  )
}
