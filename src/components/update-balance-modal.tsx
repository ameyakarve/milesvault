'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ledgerClient, isReplaceBufferError } from '@/lib/ledger-client-browser'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number)
  return ymd(new Date(Date.UTC(y!, m! - 1, d! + n)))
}

// Set a balance as-of a date: a pad (absorbing drift into Equity:Adjustments)
// plus a balance assertion. The assertion checks start-of-day, so to assert
// the balance AS OF the chosen day we date it the next day and pad the chosen
// day — the same convention statements use.
export function UpdateBalanceModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone?: () => void
}) {
  const [accounts, setAccounts] = useState<string[]>([])
  const [account, setAccount] = useState('')
  const [date, setDate] = useState(ymd(new Date()))
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open || accounts.length) return
    ledgerClient
      .getAccounts()
      .then((r) =>
        setAccounts(
          r.accounts.filter(
            (a) => a.startsWith('Assets:') || a.startsWith('Liabilities:'),
          ),
        ),
      )
      .catch(() => {})
  }, [open, accounts.length])

  // Default the currency to a rewards account's ticker leaf isn't known here;
  // INR is the right default for bank/card accounts. Rewards wallets need the
  // ticker typed (e.g. AXIS-EDGE-BURGUNDY).
  const isRewards = account.startsWith('Assets:Rewards:')

  const preview = useMemo(() => {
    if (!account || !amount || !currency) return null
    return `${date} pad ${account} Equity:Adjustments\n${addDays(date, 1)} balance ${account}  ${amount} ${currency}`
  }, [account, amount, currency, date])

  function close() {
    const ok = done
    setAccount('')
    setAmount('')
    setCurrency('INR')
    setDate(ymd(new Date()))
    setError(null)
    setDone(false)
    onClose()
    if (ok) onDone?.()
  }

  async function submit() {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const resp = await ledgerClient.replaceBuffer([], preview + '\n')
      if (isReplaceBufferError(resp)) {
        setError('message' in resp ? resp.message : 'Save failed')
        return
      }
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update a balance</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="space-y-2 py-2 text-center">
            <p className="text-sm font-medium text-foreground">Balance set</p>
            <p className="text-xs text-muted-foreground">
              A pad absorbed the difference into Equity:Adjustments.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={account} onValueChange={setAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ub-amount">Balance</Label>
                <Input
                  id="ub-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.-]/g, ''))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ub-ccy">Currency</Label>
                <Input
                  id="ub-ccy"
                  placeholder={isRewards ? 'TICKER' : 'INR'}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ub-date">As of date</Label>
              <Input
                id="ub-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="[color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            {preview ? (
              <pre className="overflow-x-auto rounded-md bg-muted/50 px-3 py-2 font-mono text-[11px] leading-4 text-foreground">
                {preview}
              </pre>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button size="sm" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void submit()} disabled={!preview || busy}>
                {busy ? <Spinner className="size-4" /> : 'Set balance'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
