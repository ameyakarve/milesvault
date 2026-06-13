'use client'

import { useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import {
  HighlightStyle,
  LRLanguage,
  LanguageSupport,
  syntaxHighlighting,
} from '@codemirror/language'
import { styleTags, tags as t } from '@lezer/highlight'
import { parser as beancountParser } from 'lezer-beancount'
import { Check } from '@phosphor-icons/react'
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
import { Separator } from '@/components/ui/separator'
import { parseJournalStrict } from '@/lib/beancount/parse-strict'
import type { TransactionInput } from '@/durable/ledger-types'
import type { DraftTransactionBatch } from '@/durable/agent-ui-schemas'

type CardStatus = 'idle' | 'submitting' | 'done' | 'failed' | 'rejected'

export type DraftTransactionBatchCardProps = {
  input: DraftTransactionBatch
  // accepted but unused — kept in the signature so the call-site stays
  // the same across the structured-shape → text-shape refactor.
  accounts?: string[]
  status?: CardStatus
  errorMessage?: string
  onApprove: (finalText: string, meta: { approved: number; skipped: number }) => void
  onReject: () => void
  // Opens the Journal filtered to a date range (split pane on desktop, tab
  // switch on mobile) — the "view what I just committed" loop-closer.
  onShowInJournal?: (range: { from: string; to: string } | null) => void
}

const beancountLang = LRLanguage.define({
  parser: beancountParser.configure({
    props: [
      styleTags({
        Date: t.literal,
        TxnFlag: t.operator,
        String: t.string,
        Account: t.variableName,
        Number: t.number,
        Currency: t.unit,
      }),
    ],
  }),
})

const HIGHLIGHT = HighlightStyle.define([
  { tag: t.literal, color: 'var(--cm-accent)' },
  { tag: t.operator, color: 'var(--cm-text)', fontWeight: '700' },
  { tag: t.string, color: 'var(--cm-muted)' },
  { tag: t.variableName, color: 'var(--cm-text)' },
  { tag: t.number, color: 'var(--cm-number)', fontWeight: '700' },
  { tag: t.unit, color: 'var(--cm-unit)' },
])

const THEME = EditorView.theme({
  '&': {
    backgroundColor: 'var(--cm-bg)',
    fontSize: '12.5px',
    fontFamily: "'JetBrains Mono', monospace",
  },
  '.cm-content': { padding: '8px 0', caretColor: 'var(--cm-caret)', color: 'var(--cm-text)' },
  '.cm-line': { padding: '0 12px', lineHeight: '22px' },
  '.cm-focused': { outline: 'none' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--cm-selection)' },
})

type Validation =
  | { kind: 'ok'; txn: TransactionInput }
  | { kind: 'parse_error' }
  | { kind: 'wrong_count'; count: number }
  | { kind: 'unbalanced'; issue: string }

// Beancount weight: `@@` total price replaces foreign-currency weight with
// price_amount in price_currency; `@` per-unit price multiplies; no price
// posts in its own currency. We sum weights per currency and flag any
// currency with >0.005 absolute drift.
function validate(text: string): Validation {
  const trimmed = text.trim()
  if (!trimmed) return { kind: 'parse_error' }
  const parsed = parseJournalStrict(trimmed)
  if (!parsed.ok) return { kind: 'parse_error' }
  if (parsed.transactions.length + parsed.directives.length !== 1 || parsed.transactions.length !== 1) {
    return {
      kind: 'wrong_count',
      count: parsed.transactions.length + parsed.directives.length,
    }
  }
  const txn = parsed.transactions[0]
  const totals = new Map<string, number>()
  for (const p of txn.postings) {
    if (!p.amount || !p.currency) continue
    const amount = Number(p.amount)
    if (!Number.isFinite(amount)) continue
    let ccy: string
    let weight: number
    if (p.price_amount && p.price_currency) {
      const pa = Number(p.price_amount)
      if (!Number.isFinite(pa)) continue
      ccy = p.price_currency
      // @@ is total price, @ is per-unit; sign carries from the posting amount.
      weight = p.price_at_signs === 2 ? Math.sign(amount) * pa : amount * pa
    } else {
      ccy = p.currency
      weight = amount
    }
    totals.set(ccy, (totals.get(ccy) ?? 0) + weight)
  }
  const issues: string[] = []
  for (const [ccy, v] of totals) {
    if (Math.abs(v) > 0.005) {
      issues.push(`${v > 0 ? '+' : ''}${v.toFixed(2)} ${ccy}`)
    }
  }
  if (issues.length > 0) return { kind: 'unbalanced', issue: issues.join(', ') }
  return { kind: 'ok', txn }
}

function StatusBadge({ v }: { v: Validation }) {
  if (v.kind === 'ok') {
    return (
      <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700">
        <Check size={12} weight="bold" />
        balanced
      </Badge>
    )
  }
  if (v.kind === 'unbalanced') {
    return (
      <Badge variant="secondary" className="bg-amber-50 text-amber-800">
        off by {v.issue}
      </Badge>
    )
  }
  if (v.kind === 'wrong_count') {
    return (
      <Badge variant="secondary" className="bg-amber-50 text-amber-800">
        {v.count === 0 ? 'no transaction' : `${v.count} entries in one card`}
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="bg-rose-50 text-rose-700">
      parse error
    </Badge>
  )
}

// Date range spanned by a set of entry texts (each starts YYYY-MM-DD).
function rangeOf(texts: string[]): { from: string; to: string } | null {
  const dates = texts
    .map((t) => /^(\d{4}-\d{2}-\d{2})/.exec(t.trim())?.[1])
    .filter((d): d is string => !!d)
    .sort()
  if (dates.length === 0) return null
  return { from: dates[0], to: dates[dates.length - 1] }
}

// First line of an entry, split into date and the rest, for the list rows.
function summaryOf(text: string): { date: string; rest: string } {
  const line = text.trim().split('\n')[0] ?? ''
  const m = /^(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(line)
  if (!m) return { date: '', rest: line }
  return { date: m[1], rest: m[2].replace(/^[*!]\s*/, '').replace(/"/g, '') }
}

function ValidityDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block size-1.5 shrink-0 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`}
      title={ok ? 'balanced' : 'needs attention'}
    />
  )
}

export function DraftTransactionBatchCard({
  input,
  status = 'idle',
  errorMessage,
  onApprove,
  onReject,
  onShowInJournal,
}: DraftTransactionBatchCardProps) {
  // The model emits one beancount entry per element; the card edits the text
  // directly. The user still hand-edits raw beancount before approving.
  const initial = useMemo(() => input.entries.map((e) => e.text.trim()), [input.entries])
  const [texts, setTexts] = useState<string[]>(() => initial)
  // Per-entry decisions: excluded rows are skipped at approval — one bad row
  // never blocks the rest of a statement.
  const [included, setIncluded] = useState<boolean[]>(() => initial.map(() => true))
  // Which row's editor is open. Single entries are always expanded.
  const [expanded, setExpanded] = useState<number | null>(initial.length === 1 ? 0 : null)

  const total = texts.length
  const isBatch = total > 1
  const validations = useMemo(() => texts.map((t) => validate(t)), [texts])
  const includedIdx = texts.map((_, i) => i).filter((i) => included[i])
  const approvedCount = includedIdx.length
  const skippedCount = total - approvedCount
  const allIncludedValid = includedIdx.every((i) => validations[i].kind === 'ok')
  const canApprove = approvedCount > 0 && allIncludedValid

  const done = status === 'done'
  const rejected = status === 'rejected'
  const disabled = status === 'submitting' || done || rejected

  const extensions = useMemo(
    () => [
      new LanguageSupport(beancountLang),
      syntaxHighlighting(HIGHLIGHT),
      THEME,
      EditorView.lineWrapping,
    ],
    [],
  )

  const updateAt = (idx: number, next: string) => {
    setTexts((arr) => arr.map((t, i) => (i === idx ? next : t)))
  }

  // Resolved cards collapse to a one-line summary — history stays readable
  // and the committed state closes the loop with a Journal link.
  if (done || rejected) {
    const range = rangeOf(texts)
    return (
      <Card size="sm">
        <CardContent className="flex items-center justify-between gap-3 py-2.5 text-sm">
          {done ? (
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <Check size={14} weight="bold" />
              {isBatch ? `Committed ${approvedCount} of ${total}` : 'Committed'}
              {skippedCount > 0 && isBatch ? (
                <span className="text-muted-foreground">· {skippedCount} skipped</span>
              ) : null}
            </span>
          ) : (
            <span className="italic text-muted-foreground">Rejected</span>
          )}
          {done && onShowInJournal ? (
            <button
              type="button"
              onClick={() => onShowInJournal(range)}
              className="shrink-0 text-xs font-medium text-foreground underline underline-offset-4 hover:no-underline"
            >
              View in Journal →
            </button>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          {isBatch ? 'Proposed transactions' : 'Proposed transaction'}
          {isBatch ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {approvedCount} of {total} selected
            </span>
          ) : null}
        </CardTitle>
        {!isBatch ? (
          <CardAction>
            <StatusBadge v={validations[0]} />
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        {isBatch ? (
          <div className="divide-y divide-border border-y bg-card">
            {texts.map((text, i) => {
              const v = validations[i]
              const sum = summaryOf(text)
              const isOpen = expanded === i
              return (
                <div key={i}>
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={included[i]}
                      disabled={disabled}
                      onChange={() =>
                        setIncluded((arr) => arr.map((x, j) => (j === i ? !x : x)))
                      }
                      className="size-3.5 accent-foreground"
                      aria-label={`Include entry ${i + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : i)}
                      className={`flex min-w-0 flex-1 items-center gap-2 text-left ${included[i] ? '' : 'opacity-40'}`}
                    >
                      <ValidityDot ok={v.kind === 'ok'} />
                      <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {sum.date}
                      </span>
                      <span className="truncate text-[12px] text-foreground/80">{sum.rest}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {isOpen ? 'close' : 'edit'}
                      </span>
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="border-t border-border bg-muted/30 px-2 pb-2 pt-1">
                      <div className="overflow-hidden rounded-md border bg-background">
                        <CodeMirror
          theme="none"
                          value={text}
                          onChange={(next) => updateAt(i, next)}
                          extensions={extensions}
                          basicSetup={{
                            lineNumbers: false,
                            foldGutter: false,
                            highlightActiveLine: false,
                            highlightActiveLineGutter: false,
                            highlightSelectionMatches: false,
                            searchKeymap: false,
                          }}
                          readOnly={disabled}
                        />
                      </div>
                      <div className="pt-1">
                        <StatusBadge v={v} />
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border bg-background">
            <CodeMirror
          theme="none"
              value={texts[0] ?? ''}
              onChange={(next) => updateAt(0, next)}
              extensions={extensions}
              basicSetup={{
                lineNumbers: false,
                foldGutter: false,
                highlightActiveLine: false,
                highlightActiveLineGutter: false,
                highlightSelectionMatches: false,
                searchKeymap: false,
              }}
              readOnly={disabled}
            />
          </div>
        )}
      </CardContent>

      {status === 'failed' && errorMessage ? (
        <>
          <Separator />
          <CardContent className="text-sm text-destructive">
            {errorMessage}
          </CardContent>
        </>
      ) : null}

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
          onClick={() =>
            onApprove(
              includedIdx.map((i) => texts[i].trim()).join('\n\n'),
              { approved: approvedCount, skipped: skippedCount },
            )
          }
          disabled={disabled || !canApprove}
          title={
            !canApprove
              ? approvedCount === 0
                ? 'Select at least one entry'
                : 'Selected entries must parse and balance — fix or untick them'
              : undefined
          }
        >
          {isBatch ? `Approve ${approvedCount} of ${total}` : 'Approve'}
        </Button>
      </CardFooter>
    </Card>
  )
}
