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
import { CaretLeft, CaretRight, Check } from '@phosphor-icons/react'
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
  onApprove: (finalText: string) => void
  onReject: () => void
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
  { tag: t.literal, color: '#00685f' },
  { tag: t.operator, color: '#191c1e', fontWeight: '700' },
  { tag: t.string, color: '#57657a' },
  { tag: t.variableName, color: '#191c1e' },
  { tag: t.number, color: '#3d4947', fontWeight: '700' },
  { tag: t.unit, color: '#515f74' },
])

const THEME = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    fontSize: '12.5px',
    fontFamily: "'JetBrains Mono', monospace",
  },
  '.cm-content': { padding: '8px 0', caretColor: '#00685f' },
  '.cm-line': { padding: '0 12px', lineHeight: '22px' },
  '.cm-focused': { outline: 'none' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'rgba(0, 104, 95, 0.2)' },
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

export function DraftTransactionBatchCard({
  input,
  status = 'idle',
  errorMessage,
  onApprove,
  onReject,
}: DraftTransactionBatchCardProps) {
  const [texts, setTexts] = useState<string[]>(() =>
    input.transactions.map((s) => s.trim()),
  )
  const [page, setPage] = useState(0)

  const total = texts.length
  const safePage = Math.min(page, total - 1)
  const current = texts[safePage] ?? ''

  const currentValidation = useMemo(() => validate(current), [current])
  const allValid = useMemo(
    () => texts.every((t) => validate(t).kind === 'ok'),
    [texts],
  )

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

  const updateCurrent = (next: string) => {
    setTexts((arr) => arr.map((t, i) => (i === safePage ? next : t)))
  }

  const isBatch = total > 1
  const title = isBatch ? 'Proposed transactions' : 'Proposed transaction'

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
          <StatusBadge v={currentValidation} />
        </CardAction>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-hidden rounded-md border bg-white">
          <CodeMirror
            key={safePage}
            value={current}
            onChange={updateCurrent}
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
            onClick={() => onApprove(texts.map((s) => s.trim()).join('\n\n'))}
            disabled={disabled || !allValid}
            title={
              !allValid
                ? isBatch
                  ? 'All rows must parse and balance'
                  : 'Must parse and balance'
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
