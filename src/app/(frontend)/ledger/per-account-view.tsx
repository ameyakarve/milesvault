'use client'

import { useMemo } from 'react'
import type {
  Entry,
  EntryBalance,
  EntryClose,
  EntryDocument,
  EntryNote,
  EntryOpen,
  EntryPad,
  EntryTxn,
  Posting,
} from '@/durable/ledger-types'
import { shortAccountName } from '@/lib/beancount/account-display'
import { useAccountEntries } from '../home/use-account-entries'
import { NotebookShell, type Card, type Seg, type SourceLine } from './notebook-shell'

const amountFmt = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const currencySymbols: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
}

function postingForAccount(txn: EntryTxn, account: string): Posting | null {
  return txn.postings.find((p) => p.account === account) ?? null
}

function postingAmountNumber(p: Posting | null): number {
  if (!p || p.amount == null) return 0
  const n = parseFloat(p.amount)
  return Number.isFinite(n) ? n : 0
}

type TxnRow = {
  kind: 'txn'
  entry: EntryTxn
  amount: number
  currency: string | null
  balance: number
}

type DirectiveRow =
  | { kind: 'open'; entry: EntryOpen }
  | { kind: 'close'; entry: EntryClose }
  | { kind: 'balance'; entry: EntryBalance }
  | { kind: 'pad'; entry: EntryPad }
  | { kind: 'note'; entry: EntryNote }
  | { kind: 'document'; entry: EntryDocument }

type RenderRow = TxnRow | DirectiveRow

type LedgerSummary = {
  rows: RenderRow[]
  dominantCurrency: string | null
  finalBalance: number
}

function buildLedgerRows(entries: Entry[], account: string): LedgerSummary {
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.kind.localeCompare(b.kind)
  })
  const counts = new Map<string, number>()
  let bal = 0
  const out: RenderRow[] = []
  for (const e of sorted) {
    if (e.kind === 'txn') {
      const post = postingForAccount(e, account)
      const amt = postingAmountNumber(post)
      bal += amt
      if (post?.currency) counts.set(post.currency, (counts.get(post.currency) ?? 0) + 1)
      out.push({ kind: 'txn', entry: e, amount: amt, currency: post?.currency ?? null, balance: bal })
    } else {
      out.push({ kind: e.kind, entry: e } as RenderRow)
    }
  }
  let dominantCurrency: string | null = null
  let max = 0
  for (const [c, n] of counts) if (n > max) { dominantCurrency = c; max = n }
  for (const row of out) {
    if (row.kind === 'txn' && !row.currency) row.currency = dominantCurrency
  }
  return { rows: out.reverse(), dominantCurrency, finalBalance: bal }
}

function directiveLabel(row: DirectiveRow): { label: string; detail: string } {
  switch (row.kind) {
    case 'open':
      return {
        label: 'open',
        detail:
          row.entry.constraint_currencies.length > 0
            ? row.entry.constraint_currencies.join(', ')
            : '',
      }
    case 'close':
      return { label: 'close', detail: '' }
    case 'balance':
      return { label: 'balance', detail: `${row.entry.amount} ${row.entry.currency}` }
    case 'pad':
      return { label: 'pad', detail: `from ${row.entry.account_pad}` }
    case 'note':
      return { label: 'note', detail: row.entry.description }
    case 'document':
      return { label: 'document', detail: row.entry.filename }
  }
}

function txnToCard(row: TxnRow, lineCounter: { n: number }, selectedAccount: string): Card {
  const headerSegs: Seg[] = [
    { kind: 'date', text: row.entry.date },
    { kind: 'ws', text: ' ' },
    { kind: 'flag', text: row.entry.flag ?? '*' },
  ]
  if (row.entry.payee) {
    headerSegs.push({ kind: 'ws', text: ' ' }, { kind: 'payee', text: `"${row.entry.payee}"` })
  }
  if (row.entry.narration) {
    headerSegs.push(
      { kind: 'ws', text: ' ' },
      { kind: 'narration', text: `"${row.entry.narration}"` },
    )
  }
  const header: SourceLine = { lineNo: lineCounter.n++, segs: headerSegs }

  const postings: SourceLine[] = row.entry.postings.map((p) => {
    const segs: Seg[] = [{ kind: 'account', text: p.account }]
    if (p.amount) segs.push({ kind: 'ws', text: ' ' }, { kind: 'number', text: p.amount })
    if (p.currency) segs.push({ kind: 'ws', text: ' ' }, { kind: 'currency', text: p.currency })
    const line: SourceLine = { lineNo: lineCounter.n++, segs }
    if (p.account === selectedAccount && p.amount) {
      const num = parseFloat(p.amount)
      if (Number.isFinite(num) && num !== 0) {
        line.delta = {
          sign: num < 0 ? '−' : '+',
          value: amountFmt.format(Math.abs(num)),
          flow: num < 0 ? 'out' : 'in',
        }
      }
    }
    return line
  })

  const balanceText = `${row.balance < 0 ? '-' : ''}${amountFmt.format(Math.abs(row.balance))}`
  return {
    id: `txn-${row.entry.id}`,
    lines: [header, ...postings],
    balance: balanceText,
  }
}

function directiveToCard(row: DirectiveRow, lineCounter: { n: number }): Card {
  const { label, detail } = directiveLabel(row)
  const segs: Seg[] = [
    { kind: 'date', text: row.entry.date },
    { kind: 'ws', text: ' ' },
    { kind: 'flag', text: label },
  ]
  if (detail) segs.push({ kind: 'ws', text: ' ' }, { kind: 'narration', text: detail })
  return {
    id: `${row.kind}-${row.entry.id}`,
    lines: [{ lineNo: lineCounter.n++, segs }],
    balance: null,
  }
}

function rowsToCards(rows: RenderRow[], selectedAccount: string): Card[] {
  const counter = { n: 1 }
  const cards: Card[] = []
  for (const row of rows) {
    cards.push(
      row.kind === 'txn'
        ? txnToCard(row, counter, selectedAccount)
        : directiveToCard(row, counter),
    )
    counter.n++ // gap slot
  }
  return cards
}

function formatBalance(value: number, currency: string | null): string {
  const prefix = currency ? currencySymbols[currency] ?? '' : ''
  const sign = value < 0 ? '-' : ''
  return `${sign}${prefix}${amountFmt.format(Math.abs(value))}`
}

export function PerAccountView({ account }: { account: string }) {
  const entriesQuery = useAccountEntries(account)
  const ledger = useMemo<LedgerSummary>(
    () =>
      entriesQuery.data
        ? buildLedgerRows(entriesQuery.data.entries, account)
        : { rows: [], dominantCurrency: null, finalBalance: 0 },
    [entriesQuery.data, account],
  )
  const cards = useMemo(() => rowsToCards(ledger.rows, account), [ledger.rows, account])

  const breadcrumb = account.split(':').filter(Boolean)
  const accountTitle = shortAccountName(account)
  const balance =
    ledger.rows.length > 0 ? formatBalance(ledger.finalBalance, ledger.dominantCurrency) : '—'
  const txnCount = ledger.rows.filter((r) => r.kind === 'txn').length

  let body: React.ReactNode
  if (entriesQuery.status === 'loading') {
    body = <div className="px-3 py-4 text-[12px] text-slate-400">Loading entries…</div>
  } else if (entriesQuery.status === 'error') {
    body = (
      <div className="px-3 py-4 text-[12px] text-rose-600">
        Failed to load: {entriesQuery.errorMsg}
      </div>
    )
  } else if (cards.length === 0) {
    body = <div className="px-3 py-4 text-[12px] text-slate-400">No entries for this account.</div>
  }

  return (
    <NotebookShell
      breadcrumb={breadcrumb}
      accountTitle={accountTitle}
      accountPath={account}
      balance={balance}
      cards={cards}
      txnCount={txnCount}
      body={body}
    />
  )
}
