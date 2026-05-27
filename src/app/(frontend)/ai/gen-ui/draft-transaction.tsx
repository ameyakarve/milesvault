'use client'

import { useMemo, useState } from 'react'
import { CaretLeft, CaretRight, Check, Plus, X } from '@phosphor-icons/react'
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import type {
  DraftPosting,
  DraftTransaction,
  DraftTransactionBatch,
} from '@/durable/agent-ui-schemas'

type CardStatus = 'idle' | 'submitting' | 'done' | 'failed' | 'rejected'

export type DraftTransactionBatchCardProps = {
  input: DraftTransactionBatch
  accounts?: string[]
  status?: CardStatus
  errorMessage?: string
  onApprove: (final: DraftTransaction[]) => void
  onReject: () => void
}

function computeBalance(postings: DraftPosting[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of postings) {
    m.set(p.currency, (m.get(p.currency) ?? 0) + p.amount)
  }
  return m
}

function isBalanced(b: Map<string, number>): boolean {
  for (const v of b.values()) if (Math.abs(v) > 0.005) return false
  return true
}

function formatBalanceIssue(b: Map<string, number>): string {
  const parts: string[] = []
  for (const [ccy, v] of b.entries()) {
    if (Math.abs(v) > 0.005) {
      parts.push(`${v > 0 ? '+' : ''}${v.toFixed(2)} ${ccy}`)
    }
  }
  return parts.join(', ')
}

export function DraftTransactionBatchCard({
  input,
  accounts = [],
  status = 'idle',
  errorMessage,
  onApprove,
  onReject,
}: DraftTransactionBatchCardProps) {
  const [drafts, setDrafts] = useState<DraftTransaction[]>(input.transactions)
  const [page, setPage] = useState(0)

  const total = drafts.length
  const safePage = Math.min(page, total - 1)
  const current = drafts[safePage]

  const currentBalance = useMemo(
    () => computeBalance(current.postings),
    [current.postings],
  )
  const currentBalanced = isBalanced(currentBalance)
  const allBalanced = useMemo(
    () => drafts.every((d) => isBalanced(computeBalance(d.postings))),
    [drafts],
  )

  const done = status === 'done'
  const rejected = status === 'rejected'
  const disabled = status === 'submitting' || done || rejected

  const updateCurrent = (patch: (d: DraftTransaction) => DraftTransaction) => {
    setDrafts((arr) => arr.map((d, i) => (i === safePage ? patch(d) : d)))
  }

  const updatePosting = (idx: number, patch: Partial<DraftPosting>) => {
    updateCurrent((d) => ({
      ...d,
      postings: d.postings.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }))
  }

  const addPosting = () => {
    const currency = current.postings[0]?.currency ?? 'USD'
    updateCurrent((d) => ({
      ...d,
      postings: [...d.postings, { account: '', amount: 0, currency }],
    }))
  }

  const removePosting = (idx: number) => {
    updateCurrent((d) => ({
      ...d,
      postings: d.postings.filter((_, i) => i !== idx),
    }))
  }

  const isBatch = total > 1
  const title = isBatch ? `Proposed transactions` : 'Proposed transaction'

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          {title}
          {isBatch ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {safePage + 1} of {total}
            </span>
          ) : null}
        </CardTitle>
        <CardAction>
          {currentBalanced ? (
            <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700">
              <Check size={12} weight="bold" />
              balanced
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-amber-50 text-amber-800">
              off by {formatBalanceIssue(currentBalance)}
            </Badge>
          )}
        </CardAction>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-2 text-sm">
          <Label htmlFor="dt-date">Date</Label>
          <Input
            id="dt-date"
            type="date"
            value={current.date}
            onChange={(e) => updateCurrent((d) => ({ ...d, date: e.target.value }))}
            disabled={disabled}
          />
          <Label htmlFor="dt-payee">Payee</Label>
          <Input
            id="dt-payee"
            type="text"
            value={current.payee ?? ''}
            onChange={(e) =>
              updateCurrent((d) => ({ ...d, payee: e.target.value || undefined }))
            }
            placeholder="—"
            disabled={disabled}
          />
          <Label htmlFor="dt-narration">Narration</Label>
          <Input
            id="dt-narration"
            type="text"
            value={current.narration ?? ''}
            onChange={(e) =>
              updateCurrent((d) => ({
                ...d,
                narration: e.target.value || undefined,
              }))
            }
            placeholder="—"
            disabled={disabled}
          />
        </div>
      </CardContent>

      <Separator />

      <CardContent>
        <div className="grid grid-cols-[1fr_120px_72px_28px] items-center gap-x-2 pb-2 text-xs uppercase tracking-wide text-muted-foreground">
          <div>Account</div>
          <div className="text-right">Amount</div>
          <div>CCY</div>
          <div />
        </div>
        <div className="flex flex-col gap-1.5">
          {current.postings.map((p, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_120px_72px_28px] items-center gap-x-2"
            >
              <AccountCombobox
                value={p.account}
                onChange={(v) => updatePosting(idx, { account: v })}
                options={accounts}
                disabled={disabled}
              />
              <Input
                type="number"
                step="0.01"
                value={Number.isFinite(p.amount) ? p.amount : ''}
                onChange={(e) =>
                  updatePosting(idx, {
                    amount:
                      e.target.value === '' ? 0 : Number(e.target.value),
                  })
                }
                disabled={disabled}
                className="text-right font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
              />
              <Input
                type="text"
                value={p.currency}
                onChange={(e) =>
                  updatePosting(idx, {
                    currency: e.target.value.toUpperCase(),
                  })
                }
                disabled={disabled}
                className="font-mono uppercase"
              />
              {current.postings.length > 2 && !disabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removePosting(idx)}
                  aria-label="Remove posting"
                  title="Remove posting"
                >
                  <X size={14} weight="bold" />
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addPosting}
          disabled={disabled}
          className="mt-3 w-full border-dashed"
        >
          <Plus size={13} weight="bold" />
          Add posting
        </Button>
      </CardContent>

      {isBatch ? (
        <>
          <Separator />
          <CardContent className="flex items-center justify-between py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
            >
              <CaretLeft size={14} weight="bold" />
              Prev
            </Button>
            <span className="text-xs text-muted-foreground">
              {safePage + 1} / {total}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
              disabled={safePage === total - 1}
            >
              Next
              <CaretRight size={14} weight="bold" />
            </Button>
          </CardContent>
        </>
      ) : null}

      {status === 'failed' && errorMessage ? (
        <>
          <Separator />
          <CardContent className="text-sm text-destructive">
            {errorMessage}
          </CardContent>
        </>
      ) : null}

      {rejected ? (
        <>
          <Separator />
          <CardContent className="text-sm text-muted-foreground italic">
            Rejected
          </CardContent>
        </>
      ) : null}

      {done || rejected ? null : (
        <CardFooter className="justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReject}
            disabled={disabled}
          >
            Reject
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onApprove(drafts)}
            disabled={disabled || !allBalanced}
            title={
              !allBalanced
                ? isBatch
                  ? 'All rows must balance'
                  : 'Postings must balance'
                : undefined
            }
          >
            {status === 'submitting'
              ? 'Saving…'
              : isBatch
                ? `Approve ${total}`
                : 'Approve'}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

function AccountCombobox({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string
  onChange: (next: string) => void
  options: string[]
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const exactMatch = options.some(
    (o) => o.toLowerCase() === search.trim().toLowerCase(),
  )

  function commit(next: string) {
    onChange(next)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center rounded-md border bg-background px-3 py-1 text-left font-mono text-sm disabled:cursor-not-allowed disabled:opacity-50',
          !value && 'text-muted-foreground',
        )}
      >
        {value || 'Account…'}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">

        <Command>
          <CommandInput
            placeholder="Search accounts…"
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && search.trim() && !exactMatch) {
                e.preventDefault()
                commit(search.trim())
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  type="button"
                  onClick={() => commit(search.trim())}
                  className="text-left text-sm"
                >
                  Use <span className="font-mono">{search.trim()}</span>
                </button>
              ) : (
                'No accounts.'
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => commit(opt)}
                  className="font-mono text-sm"
                >
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
