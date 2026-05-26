'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  Check,
  Plus,
  X,
} from '@phosphor-icons/react'
import type {
  DraftPosting,
  DraftTransaction,
} from '@/durable/agent-ui-schemas'

type CardStatus = 'idle' | 'submitting' | 'done' | 'failed'

export type DraftTransactionCardProps = {
  input: DraftTransaction
  accounts?: string[]
  status?: CardStatus
  committedSummary?: string
  errorMessage?: string
  onApprove: (final: DraftTransaction) => void
  onSendBack: (final: DraftTransaction, note?: string) => void
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

export function DraftTransactionCard({
  input,
  accounts = [],
  status = 'idle',
  committedSummary,
  errorMessage,
  onApprove,
  onSendBack,
  onReject,
}: DraftTransactionCardProps) {
  const [draft, setDraft] = useState<DraftTransaction>(input)
  const [showSendBack, setShowSendBack] = useState(false)
  const [note, setNote] = useState('')

  const balance = useMemo(() => computeBalance(draft.postings), [draft.postings])
  const balanced = isBalanced(balance)

  if (status === 'done' && committedSummary) {
    return (
      <div className="inline-flex items-center gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
        <Check size={14} weight="bold" />
        {committedSummary}
      </div>
    )
  }

  const disabled = status === 'submitting'

  const updatePosting = (idx: number, patch: Partial<DraftPosting>) => {
    setDraft((d) => ({
      ...d,
      postings: d.postings.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }))
  }

  const addPosting = () => {
    const currency = draft.postings[0]?.currency ?? 'USD'
    setDraft((d) => ({
      ...d,
      postings: [...d.postings, { account: '', amount: 0, currency }],
    }))
  }

  const removePosting = (idx: number) => {
    setDraft((d) => ({
      ...d,
      postings: d.postings.filter((_, i) => i !== idx),
    }))
  }

  return (
    <div className="rounded-[12px] border border-slate-200 bg-white">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <div className="text-[12px] font-medium uppercase tracking-wide text-slate-500">
          Proposed transaction
        </div>
        {balanced ? (
          <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <Check size={12} weight="bold" />
            balanced
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            off by {formatBalanceIssue(balance)}
          </div>
        )}
      </header>

      <div className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1 px-4 py-3 text-[13px]">
        <label className="self-center text-slate-500">Date</label>
        <input
          type="date"
          value={draft.date}
          onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
          disabled={disabled}
          className="rounded-[6px] border border-transparent bg-transparent px-1.5 py-0.5 text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none disabled:opacity-60"
        />
        <label className="self-center text-slate-500">Payee</label>
        <input
          type="text"
          value={draft.payee ?? ''}
          onChange={(e) =>
            setDraft((d) => ({ ...d, payee: e.target.value || undefined }))
          }
          placeholder="—"
          disabled={disabled}
          className="rounded-[6px] border border-transparent bg-transparent px-1.5 py-0.5 text-slate-900 placeholder:text-slate-300 focus:border-teal-500 focus:bg-white focus:outline-none disabled:opacity-60"
        />
        <label className="self-center text-slate-500">Narration</label>
        <input
          type="text"
          value={draft.narration ?? ''}
          onChange={(e) =>
            setDraft((d) => ({ ...d, narration: e.target.value || undefined }))
          }
          placeholder="—"
          disabled={disabled}
          className="rounded-[6px] border border-transparent bg-transparent px-1.5 py-0.5 text-slate-900 placeholder:text-slate-300 focus:border-teal-500 focus:bg-white focus:outline-none disabled:opacity-60"
        />
      </div>

      <div className="border-t border-slate-100 px-4 py-3">
        <div className="grid grid-cols-[1fr_120px_56px_28px] items-center gap-x-2 pb-1.5 text-[10px] uppercase tracking-wide text-slate-400">
          <div>Account</div>
          <div className="text-right">Amount</div>
          <div>CCY</div>
          <div />
        </div>
        <div className="flex flex-col gap-1">
          {draft.postings.map((p, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_120px_56px_28px] items-center gap-x-2"
            >
              <AccountCombobox
                value={p.account}
                onChange={(v) => updatePosting(idx, { account: v })}
                options={accounts}
                disabled={disabled}
              />
              <input
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
                className="w-full rounded-[6px] border border-slate-200 bg-white px-2 py-1 text-right font-mono text-[12.5px] text-slate-900 focus:border-teal-500 focus:outline-none disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
              />
              <input
                type="text"
                value={p.currency}
                onChange={(e) =>
                  updatePosting(idx, {
                    currency: e.target.value.toUpperCase(),
                  })
                }
                disabled={disabled}
                className="w-full rounded-[6px] border border-slate-200 bg-white px-2 py-1 font-mono text-[12.5px] uppercase text-slate-700 focus:border-teal-500 focus:outline-none disabled:opacity-60"
              />
              {draft.postings.length > 2 && !disabled ? (
                <button
                  type="button"
                  onClick={() => removePosting(idx)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Remove posting"
                  title="Remove posting"
                >
                  <X size={14} weight="bold" />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addPosting}
          disabled={disabled}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-slate-200 px-2 py-1.5 text-[12px] font-medium text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
        >
          <Plus size={13} weight="bold" />
          Add posting
        </button>
      </div>

      {showSendBack ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <label className="text-[10px] uppercase tracking-wide text-slate-500">
            Note for the agent (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder='e.g. "split into Food + Household"'
            disabled={disabled}
            rows={2}
            className="mt-1.5 w-full resize-none rounded-[6px] border border-slate-200 px-2 py-1.5 text-[13px] text-slate-900 placeholder:text-slate-300 focus:border-teal-500 focus:outline-none"
          />
        </div>
      ) : null}

      {status === 'failed' && errorMessage ? (
        <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-[12px] text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <footer className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5">
        <button
          type="button"
          onClick={onReject}
          disabled={disabled}
          className="rounded-full px-3 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-rose-700 disabled:opacity-50"
        >
          Reject
        </button>
        <div className="flex items-center gap-2">
          {showSendBack ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowSendBack(false)
                  setNote('')
                }}
                disabled={disabled}
                className="rounded-full px-3 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onSendBack(draft, note.trim() || undefined)}
                disabled={disabled}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <ArrowCounterClockwise size={12} weight="bold" />
                Send back
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowSendBack(true)}
              disabled={disabled}
              className="rounded-full px-3 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            >
              Send back
            </button>
          )}
          <button
            type="button"
            onClick={() => onApprove(draft)}
            disabled={disabled || !balanced}
            title={!balanced ? 'Postings must balance' : undefined}
            className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-[12px] font-medium text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {status === 'submitting' ? 'Saving…' : 'Approve'}
          </button>
        </div>
      </footer>
    </div>
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
  const [highlight, setHighlight] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return options.slice(0, 8)
    return options
      .filter((o) => o.toLowerCase().includes(q))
      .slice(0, 8)
  }, [options, value])

  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  function commit(opt: string) {
    onChange(opt)
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div ref={ref} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder="Account"
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            setOpen(true)
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => Math.min(matches.length - 1, h + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(0, h - 1))
          } else if (e.key === 'Enter') {
            if (open && matches[highlight]) {
              e.preventDefault()
              commit(matches[highlight]!)
            }
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        className="w-full rounded-[6px] border border-slate-200 bg-white px-2 py-1 font-mono text-[12.5px] text-slate-900 focus:border-teal-500 focus:outline-none disabled:opacity-60"
      />
      {open && matches.length > 0 ? (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 max-h-56 w-[max(100%,18rem)] overflow-auto rounded-[8px] border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault()
                commit(opt)
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer px-2.5 py-1 font-mono text-[12.5px] ${
                i === highlight
                  ? 'bg-teal-50 text-teal-900'
                  : 'text-slate-700'
              }`}
            >
              {opt}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
