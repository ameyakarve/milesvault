'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check } from '@phosphor-icons/react'
import type { ExtractStatementRowsProps } from '@/durable/agent-ui-schemas'
import type {
  AccountEntriesResponse,
  EntryTxn,
} from '@/durable/ledger-types'
import { useChatActions } from '../chat-actions'

type DupeIndex = Map<string, number>

const NEIGHBORHOOD_LIMIT = 250

function makeKey(date: string, amount: number): string {
  return `${date}|${Math.abs(amount).toFixed(2)}`
}

function buildDupeIndex(
  entries: AccountEntriesResponse | null,
  account: string | undefined,
  currency: string,
): DupeIndex {
  const map: DupeIndex = new Map()
  if (!entries || !account) return map
  for (const e of entries.entries) {
    if (e.kind !== 'txn') continue
    const txn = e as EntryTxn
    for (const p of txn.postings) {
      if (p.account !== account) continue
      if (p.currency && p.currency !== currency) continue
      if (p.amount == null) continue
      const n = Number(p.amount)
      if (!Number.isFinite(n)) continue
      map.set(makeKey(txn.date, n), txn.id)
    }
  }
  return map
}

export function StatementRows({ input }: { input: ExtractStatementRowsProps }) {
  const { sendMessage, busy } = useChatActions()
  const [entries, setEntries] = useState<AccountEntriesResponse | null>(null)
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'error'>(
    input.account_hint ? 'loading' : 'idle',
  )
  const [submitted, setSubmitted] = useState(false)

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: input.currency || 'USD',
        maximumFractionDigits: 2,
        signDisplay: 'auto',
      }),
    [input.currency],
  )
  const balFmt = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: input.currency || 'USD',
        maximumFractionDigits: 2,
      }),
    [input.currency],
  )

  useEffect(() => {
    const account = input.account_hint
    if (!account) {
      setEntries(null)
      setFetchState('idle')
      return
    }
    let cancelled = false
    setFetchState('loading')
    const url = `/api/ledger/accounts/${encodeURIComponent(account)}/entries?limit=${NEIGHBORHOOD_LIMIT}`
    fetch(url, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`fetch failed (${res.status})`)
        return res.json() as Promise<AccountEntriesResponse>
      })
      .then((body) => {
        if (cancelled) return
        setEntries(body)
        setFetchState('idle')
      })
      .catch(() => {
        if (cancelled) return
        setEntries(null)
        setFetchState('error')
      })
    return () => {
      cancelled = true
    }
  }, [input.account_hint])

  const dupeIndex = useMemo(
    () => buildDupeIndex(entries, input.account_hint, input.currency),
    [entries, input.account_hint, input.currency],
  )

  type RowStatus =
    | { status: 'dupe'; matchId: number }
    | { status: 'new'; matchId: null }
  const rowStatuses = useMemo<RowStatus[]>(
    () =>
      input.rows.map((r): RowStatus => {
        const matchId = dupeIndex.get(makeKey(r.date, r.amount))
        return matchId != null
          ? { status: 'dupe', matchId }
          : { status: 'new', matchId: null }
      }),
    [input.rows, dupeIndex],
  )

  const [selected, setSelected] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (fetchState === 'loading') return
    const next = new Set<number>()
    rowStatuses.forEach((s, i) => {
      if (s.status === 'new') next.add(i)
    })
    setSelected(next)
  }, [rowStatuses, fetchState])

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const hasBalance = input.rows.some((r) => typeof r.balance === 'number')
  const hasType = input.rows.some((r) => r.type && r.type.length > 0)

  const newCount = rowStatuses.filter((s) => s.status === 'new').length
  const dupeCount = rowStatuses.length - newCount
  const selectedCount = selected.size

  function onCommit() {
    if (submitted || busy || selectedCount === 0) return
    setSubmitted(true)
    const account = input.account_hint
    const lines = input.rows
      .map((r, i) => {
        if (!selected.has(i)) return null
        const desc = r.description.replace(/\s+/g, ' ').trim()
        const amt = r.amount.toFixed(2)
        const type = r.type ? ` [${r.type}]` : ''
        return `- ${r.date}  ${desc}${type}  ${amt} ${input.currency}`
      })
      .filter((x): x is string => x !== null)

    const header = account
      ? `Commit these ${selectedCount} rows as transactions in \`${account}\` (${input.currency}):`
      : `Commit these ${selectedCount} rows as transactions (${input.currency}). Pick the appropriate ledger account based on context:`

    const body = [
      header,
      '',
      ...lines,
      '',
      'Use propose_journal_edit. Each row becomes a balanced transaction; pick a reasonable counterparty (Expenses:* / Income:* / Liabilities:*) from the chart of accounts based on the description. Use the user\'s prevailing date/payee/narration style from the recent journal sample.',
    ].join('\n')

    void sendMessage({ text: body })
  }

  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        {input.account_hint && (
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            {input.account_hint}
          </div>
        )}
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-slate-900">
            {input.source_filename || 'Statement preview'}
          </span>
          {input.statement_period && (
            <span className="text-xs text-slate-400">
              {input.statement_period}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          <span>{input.rows.length} rows</span>
          <span className="text-teal-600">{newCount} new</span>
          <span className="text-slate-400">{dupeCount} already in ledger</span>
          {fetchState === 'loading' && (
            <span className="text-slate-400">checking ledger…</span>
          )}
          {fetchState === 'error' && (
            <span className="text-rose-600">
              couldn’t check ledger — dupes not flagged
            </span>
          )}
        </div>
      </div>

      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Description</th>
              {hasType && (
                <th className="px-4 py-2 text-left font-medium">Type</th>
              )}
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              {hasBalance && (
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {input.rows.map((r, i) => {
              const status = rowStatuses[i]!
              const isDupe = status.status === 'dupe'
              const isChecked = selected.has(i)
              const positive = r.amount >= 0
              const rowBg = isDupe
                ? 'bg-slate-50/60'
                : isChecked
                  ? ''
                  : 'bg-slate-50/40'
              const muted = isDupe || !isChecked
              const struck = isDupe
              return (
                <tr key={i} className={rowBg}>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      disabled={submitted || busy}
                      aria-label={isChecked ? 'Skip row' : 'Include row'}
                      className={`flex h-4 w-4 items-center justify-center rounded-[4px] border transition disabled:opacity-50 ${
                        isChecked
                          ? 'border-teal-500 bg-teal-500 text-white'
                          : 'border-slate-300 bg-white hover:border-slate-400'
                      }`}
                    >
                      {isChecked && <Check size={11} weight="bold" />}
                    </button>
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-1.5 tabular-nums ${
                      muted ? 'text-slate-400' : 'text-slate-500'
                    } ${struck ? 'line-through' : ''}`}
                  >
                    {r.date}
                  </td>
                  <td className="px-4 py-1.5">
                    <span
                      className={`line-clamp-2 ${
                        muted ? 'text-slate-400' : 'text-slate-900'
                      } ${struck ? 'line-through' : ''}`}
                    >
                      {r.description}
                    </span>
                    {isDupe && status.matchId != null && (
                      <span className="ml-2 inline-flex items-center rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] tracking-wide text-slate-500">
                        matches #{status.matchId}
                      </span>
                    )}
                  </td>
                  {hasType && (
                    <td
                      className={`whitespace-nowrap px-4 py-1.5 ${
                        muted ? 'text-slate-400' : 'text-slate-500'
                      } ${struck ? 'line-through' : ''}`}
                    >
                      {r.type ?? ''}
                    </td>
                  )}
                  <td
                    className={`whitespace-nowrap px-4 py-1.5 text-right tabular-nums ${
                      struck ? 'line-through' : ''
                    } ${
                      muted
                        ? 'text-slate-400'
                        : positive
                          ? 'text-teal-600'
                          : 'text-slate-700'
                    }`}
                  >
                    {fmt.format(r.amount)}
                  </td>
                  {hasBalance && (
                    <td
                      className={`whitespace-nowrap px-4 py-1.5 text-right tabular-nums ${
                        muted ? 'text-slate-400' : 'text-slate-500'
                      } ${struck ? 'line-through' : ''}`}
                    >
                      {typeof r.balance === 'number'
                        ? balFmt.format(r.balance)
                        : ''}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5">
        <span className="text-[11px] text-slate-500">
          {submitted
            ? 'Sent for commit — review the next message.'
            : `${selectedCount} of ${input.rows.length} selected`}
        </span>
        {!submitted && (
          <button
            type="button"
            onClick={onCommit}
            disabled={busy || selectedCount === 0}
            className="rounded-[8px] bg-teal-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-teal-600 disabled:opacity-40"
          >
            Commit {selectedCount > 0 ? `${selectedCount} ` : ''}selection
          </button>
        )}
      </div>
    </div>
  )
}
