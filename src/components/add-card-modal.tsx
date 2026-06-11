'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AddCardCard, type AddCardResult } from '@/app/(frontend)/ai/gen-ui/add-card'
import { ledgerClient, isReplaceBufferError } from '@/lib/ledger-client-browser'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Direct add-a-card (owner call: no chat round-trip): the KG picker collects
// the card, last-4 and an optional current points balance; confirm writes the
// open directive (the save path auto-opens the rewards wallet) plus a points
// assertion when given — append-only through the same batch endpoint as
// every other write.
export function AddCardModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function save(r: AddCardResult) {
    setBusy(true)
    setError(null)
    try {
      const today = new Date()
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
      let text = `${ymd(today)} open ${r.liability_account} INR\n`
      if (r.opening_points && r.wallet_account && r.pool_ticker) {
        // Assertions check start-of-day: pad today, assert tomorrow.
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
        text += `\n${ymd(today)} pad ${r.wallet_account} Equity:Adjustments\n${ymd(tomorrow)} balance ${r.wallet_account}  ${r.opening_points} ${r.pool_ticker}\n`
      }
      const resp = await ledgerClient.replaceBuffer([], text)
      if (isReplaceBufferError(resp)) {
        setError('message' in resp ? resp.message : 'Save failed')
        return
      }
      setDone(r.card)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function close() {
    setError(null)
    setDone(null)
    onClose()
    if (done) onDone?.()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a card</DialogTitle>
        </DialogHeader>
        {done ? (
          <div className="space-y-3 px-1 py-2 text-center">
            <p className="text-sm font-medium text-foreground">{done} added</p>
            <p className="text-xs text-muted-foreground">
              The card account is open and its rewards programme is on the
              Vault. Statements will fill in the rest.
            </p>
            <button
              type="button"
              onClick={close}
              className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:bg-foreground/90"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <AddCardCard
              input={{}}
              status={busy ? 'submitting' : 'idle'}
              onResult={(r) => void save(r)}
              onReject={close}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
