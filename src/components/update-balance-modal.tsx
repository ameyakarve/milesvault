'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { ledgerClient, isReplaceBufferError } from '@/lib/ledger-client-browser'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number)
  return ymd(new Date(Date.UTC(y!, m! - 1, d! + n)))
}

// Set a balance as-of a date: a pad (absorbing drift into Equity:Void, the
// universal pad plug everywhere in this ledger) plus a balance assertion. The
// assertion checks start-of-day, so to assert
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
  // Only accounts with activity (txns or balance assertions), each with the
  // currencies seen on it — the currency is taken from the chosen account.
  const [targets, setTargets] = useState<Array<{ account: string; currencies: string[] }>>([])
  const [account, setAccount] = useState('')
  const [acctOpen, setAcctOpen] = useState(false)
  const [date, setDate] = useState(ymd(new Date()))
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // On open, load the balance targets (active Assets/Liabilities accounts +
  // their currencies). The date already defaults to today (useState init +
  // close() reset), so it's today on every open.
  useEffect(() => {
    if (!open) return
    ledgerClient
      .getAccounts()
      .then((r) => {
        setTargets(
          (r.balanceTargets ?? []).filter(
            (t) => t.account.startsWith('Assets:') || t.account.startsWith('Liabilities:'),
          ),
        )
      })
      .catch(() => {})
  }, [open])

  // Currencies for the chosen account; the currency is fixed when there's one,
  // a dropdown when there are several.
  const acctCurrencies = useMemo(
    () => targets.find((t) => t.account === account)?.currencies ?? [],
    [targets, account],
  )

  // Pick an account: select it and set its currency (prefer INR, else first).
  function pickAccount(a: string) {
    setAccount(a)
    setAcctOpen(false)
    const curs = targets.find((t) => t.account === a)?.currencies ?? []
    setCurrency(curs.includes('INR') ? 'INR' : (curs[0] ?? ''))
  }

  const preview = useMemo(() => {
    if (!account || !amount || !currency) return null
    return `${date} pad ${account} Equity:Void\n${addDays(date, 1)} balance ${account}  ${amount} ${currency}`
  }, [account, amount, currency, date])

  function close() {
    const ok = done
    setAccount('')
    setAmount('')
    setCurrency('')
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
              A pad absorbed the difference into Equity:Void.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Popover open={acctOpen} onOpenChange={setAcctOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className="w-full justify-between font-normal"
                    />
                  }
                >
                  <span className={cn('truncate', !account && 'text-muted-foreground')}>
                    {account || 'Choose an account'}
                  </span>
                  <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-[420px] max-w-[90vw] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search accounts…" />
                    <CommandList>
                      <CommandEmpty>No matching account.</CommandEmpty>
                      <CommandGroup>
                        {targets.map((t) => (
                          <CommandItem
                            key={t.account}
                            value={t.account}
                            onSelect={() => pickAccount(t.account)}
                          >
                            <Check
                              className={cn(
                                'size-4',
                                account === t.account ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            <span className="truncate font-mono text-[12px]">{t.account}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
                {acctCurrencies.length > 1 ? (
                  // Several currencies on this account → pick one.
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="ub-ccy">
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {acctCurrencies.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  // One currency (fixed) or no account chosen yet — not editable.
                  <Input
                    id="ub-ccy"
                    value={currency}
                    disabled
                    placeholder={account ? '' : 'Pick an account'}
                  />
                )}
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
