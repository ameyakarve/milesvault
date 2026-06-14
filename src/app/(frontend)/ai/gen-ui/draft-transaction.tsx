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
import { classifyDraftEntry, type DraftEntryVerdict } from '@/lib/beancount/validate-draft-batch'
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
  // CodeMirror draws the caret as a bordered element and ignores caretColor —
  // without this it defaults to black, invisible in dark mode.
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--cm-caret)',
    borderLeftWidth: '1.5px',
  },
  '.cm-line': { padding: '0 12px', lineHeight: '22px' },
  '.cm-focused': { outline: 'none' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--cm-selection)' },
})

// Validity is classified by the SHARED validator (validate-draft-batch) — the
// same one the tool boundary and the write path use — so the card never
// disagrees with the server about what's approvable (a pad/balance entry, a
// dropped posting, a bad account shape all classify identically here and there).

// A one-line human reason for a non-ok verdict — used for the badge and the
// "why can't I approve" summary.
function reasonOf(v: DraftEntryVerdict): string {
  switch (v.kind) {
    case 'ok':
      return ''
    case 'unbalanced':
      return `off by ${v.residuals.map((r) => `${r.amount} ${r.currency}`).join(', ')}`
    case 'wrong_count':
      return v.count === 0 ? 'no transaction' : `${v.count} transactions in one entry`
    case 'parse_error':
      return 'parse error'
    case 'dropped_posting':
      return 'a posting was dropped'
    case 'elided':
      return 'a posting is missing its amount'
    case 'account_shape':
      return 'invalid account name'
    case 'wrong_kind':
      return 'unsupported directive'
  }
}

function StatusBadge({ v }: { v: DraftEntryVerdict }) {
  if (v.kind === 'ok') {
    return (
      <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700">
        <Check size={12} weight="bold" />
        {v.isBalance ? 'balance' : 'balanced'}
      </Badge>
    )
  }
  // Imbalances are amber (a fixable arithmetic slip); structural problems are
  // rose (the entry is malformed). The full message rides in the tooltip.
  const amber = v.kind === 'unbalanced' || v.kind === 'wrong_count'
  return (
    <Badge
      variant="secondary"
      className={amber ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700'}
      title={v.messages[0]}
    >
      {reasonOf(v)}
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
  const validations = useMemo(() => texts.map((t) => classifyDraftEntry(t)), [texts])
  const includedIdx = texts.map((_, i) => i).filter((i) => included[i])
  const approvedCount = includedIdx.length
  const skippedCount = total - approvedCount
  // The selected entries that aren't approvable, with a one-line reason each —
  // surfaced inline so "why can't I approve" never depends on a hover tooltip.
  const blocking = includedIdx
    .filter((i) => validations[i].kind !== 'ok')
    .map((i) => ({ i, reason: reasonOf(validations[i]) }))
  const allIncludedValid = blocking.length === 0
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

      {!disabled && blocking.length > 0 ? (
        <>
          <Separator />
          <CardContent className="space-y-1 text-xs text-amber-700 dark:text-amber-400">
            <p className="font-medium">
              {blocking.length === 1
                ? "1 selected entry needs fixing before you can approve:"
                : `${blocking.length} selected entries need fixing before you can approve:`}
            </p>
            <ul className="space-y-0.5">
              {blocking.map(({ i, reason }) => (
                <li key={i} className="flex gap-1.5">
                  <span className="font-mono text-muted-foreground">{summaryOf(texts[i]).date || `#${i + 1}`}</span>
                  <span>— {reason}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">Edit the entry, or untick it to approve the rest.</p>
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
