'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView, keymap } from '@codemirror/view'
import {
  HighlightStyle,
  LRLanguage,
  LanguageSupport,
  syntaxHighlighting,
} from '@codemirror/language'
import { styleTags, tags as t } from '@lezer/highlight'
import { parser as beancountParser } from 'lezer-beancount'
import { shortAccountName } from '@/lib/beancount/account-display'
import { parseJournal, serializeJournal } from '@/lib/beancount/ast'
import { isStrictParseErr, parseJournalStrict } from '@/lib/beancount/parse-strict'
import {
  directiveTouchesAccountCurrency,
  txnTouchesAccountCurrency,
} from '@/lib/beancount/scope'
import { ledgerClient, isJournalPutError } from '@/lib/ledger-client-browser'
import { NotebookShell } from './notebook-shell'
import { StatementView, type StatementRowData } from './statement-view'
import {
  cardDecorations,
  computeCardSpecs,
  formatHeaderBalance,
  setCardSpecs,
  type CardSpec,
} from './card-decorations'

const CURRENCY_META: Record<string, { symbol: string; locale: string }> = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
}

function formatSignedStat(n: number, currency: string, sign: '+' | '−'): string {
  const meta = CURRENCY_META[currency]
  const abs = Math.abs(n)
  const grouped = new Intl.NumberFormat(meta?.locale ?? 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs)
  if (meta) return `${sign}${meta.symbol}${grouped}`
  return `${sign}${grouped} ${currency}`
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
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', monospace",
    height: '100%',
  },
  '.cm-scroller': { fontFamily: "'JetBrains Mono', monospace" },
  '.cm-content': { padding: '0', caretColor: '#00685f' },
  '.cm-line': { padding: '0 12px', lineHeight: '28px', position: 'relative' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'rgba(0, 104, 95, 0.2)' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(0, 104, 95, 0.06)',
    color: '#475569',
  },
  '.cm-focused': { outline: 'none' },
  '.cm-delta-inlay': {
    position: 'absolute',
    right: '17px',
    top: '0',
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: '500',
    fontVariantNumeric: 'tabular-nums',
    color: '#94a3b8',
    pointerEvents: 'none',
  },
  '.cm-delta-out': { color: 'rgb(225, 29, 72)' },
  '.cm-delta-in': { color: 'rgb(15, 118, 110)' },
  '.cm-amount-out': {
    color: 'rgb(225, 29, 72)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    fontWeight: '500',
    fontVariantNumeric: 'tabular-nums',
  },
  '.cm-amount-in': {
    color: 'rgb(15, 118, 110)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    fontWeight: '500',
    fontVariantNumeric: 'tabular-nums',
  },
  '.cm-gutters': {
    backgroundColor: '#e0e3e5',
    borderRight: '1px solid rgba(226, 232, 240, 0.3)',
    color: '#bcc9c6',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    lineHeight: '28px',
    padding: '0 8px 0 0',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    display: 'flex',
    justifyContent: 'flex-end',
    minWidth: '24px',
  },
})

const BASIC = {
  lineNumbers: true,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: true,
  highlightSelectionMatches: false,
  searchKeymap: false,
} as const

function rewriteDescending(text: string): string {
  const parsed = parseJournal(text)
  return serializeJournal(parsed.transactions, parsed.directives, { descending: true })
}

function sliceFromWhole(text: string, account: string, currency: string): string {
  const parsed = parseJournal(text)
  const txns = parsed.transactions.filter((tx) =>
    txnTouchesAccountCurrency(tx, account, currency),
  )
  const directives = parsed.directives.filter((d) =>
    directiveTouchesAccountCurrency(d, account, currency),
  )
  return serializeJournal(txns, directives, { descending: true })
}

export function PerAccountView({
  account,
  defaultViewMode,
}: {
  account: string
  defaultViewMode?: 'editor' | 'statement'
}) {
  const [loaded, setLoaded] = useState(false)
  const [currencies, setCurrencies] = useState<string[]>([])
  const [currency, setCurrency] = useState<string | null>(null)
  const [children, setChildren] = useState<string[]>([])
  const [savedSlice, setSavedSlice] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const resp = await ledgerClient.getAccountChildren(account, {
          signal: controller.signal,
        })
        setChildren(resp.children)
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    })()
    return () => controller.abort()
  }, [account])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const curResp = await ledgerClient.getAccountCurrencies(account, {
          signal: controller.signal,
        })
        setCurrencies(curResp.currencies)
        const cur = curResp.currencies[0] ?? null
        setCurrency(cur)
        if (cur) {
          const slice = await ledgerClient.getJournalForAccount(account, cur, {
            signal: controller.signal,
          })
          const desc = rewriteDescending(slice.text)
          setSavedSlice(desc)
          setText(desc)
        } else {
          setSavedSlice('')
          setText('')
        }
        setLoaded(true)
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(e instanceof Error ? e.message : String(e))
        setLoaded(true)
      }
    })()
    return () => controller.abort()
  }, [account])

  const onCurrencyChange = useCallback(
    async (next: string) => {
      setCurrency(next)
      setError(null)
      try {
        const slice = await ledgerClient.getJournalForAccount(account, next)
        const desc = rewriteDescending(slice.text)
        setSavedSlice(desc)
        setText(desc)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [account],
  )

  const textRef = useRef(text)
  textRef.current = text

  const save = useCallback(async () => {
    if (saving || !currency) return
    setSaving(true)
    setError(null)
    const parsedSlice = parseJournalStrict(textRef.current)
    if (isStrictParseErr(parsedSlice)) {
      setError(parsedSlice.message)
      setSaving(false)
      return
    }
    try {
      const journal = await ledgerClient.getJournal()
      const whole = parseJournal(journal.text)
      const keepTxns = whole.transactions.filter(
        (tx) => !txnTouchesAccountCurrency(tx, account, currency),
      )
      const keepDirectives = whole.directives.filter(
        (d) => !directiveTouchesAccountCurrency(d, account, currency),
      )
      const newWholeText = serializeJournal(
        [...keepTxns, ...parsedSlice.transactions],
        [...keepDirectives, ...parsedSlice.directives],
      )
      const data = await ledgerClient.putJournal(newWholeText)
      if (isJournalPutError(data)) {
        setError(data.message)
        return
      }
      const updated = sliceFromWhole(data.text, account, currency)
      setSavedSlice(updated)
      setText(updated)
      const cur = await ledgerClient.getAccountCurrencies(account)
      setCurrencies(cur.currencies)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }, [saving, currency, account])

  const unsaved = loaded && text !== savedSlice

  const parsed = useMemo(() => parseJournalStrict(text), [text])
  const parseFailed = isStrictParseErr(parsed)

  const cardSpecs = useMemo<CardSpec[]>(() => {
    if (!currency || isStrictParseErr(parsed)) return []
    return computeCardSpecs(
      parsed.transactions,
      parsed.directives,
      parsed.entries,
      account,
      currency,
      { descending: true },
    )
  }, [parsed, account, currency])

  const { statementRows, statementTotals } = useMemo<{
    statementRows: StatementRowData[]
    statementTotals: {
      totalDebit: string
      totalCredit: string
      netChange: string
      netPositive: boolean
    }
  }>(() => {
    const emptyTotals = {
      totalDebit: '',
      totalCredit: '',
      netChange: '',
      netPositive: true,
    }
    if (!currency || isStrictParseErr(parsed)) {
      return { statementRows: [], statementTotals: emptyTotals }
    }
    const lines = text.split('\n')
    const meta = CURRENCY_META[currency]
    const grouped = (n: number) =>
      new Intl.NumberFormat(meta?.locale ?? 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(n))
    const rows: StatementRowData[] = []
    let dSum = 0
    let cSum = 0
    for (let i = 0; i < parsed.entries.length; i++) {
      const e = parsed.entries[i]!
      if (e.kind !== 'transaction') continue
      const tx = parsed.transactions[e.index]
      if (!tx) continue
      const spec = cardSpecs[i]
      if (!spec) continue
      let net = 0
      for (const p of tx.postings) {
        if (
          p.account === account ||
          (p.account?.startsWith(account + ':') ?? false)
        ) {
          if (p.currency === currency && p.amount != null) {
            const v = Number(p.amount)
            if (Number.isFinite(v)) net += v
          }
        }
      }
      if (net < 0) dSum += -net
      else if (net > 0) cSum += net
      const debit = net < 0 ? grouped(net) : null
      const credit = net > 0 ? grouped(net) : null
      const otherPostings = tx.postings
        .filter(
          (p) =>
            !(p.account === account || (p.account?.startsWith(account + ':') ?? false)),
        )
        .map((p) => ({
          account: p.account,
          amountSigned:
            p.amount != null
              ? `${Number(p.amount) < 0 ? '−' : '+'}${grouped(Number(p.amount))} ${
                  p.currency ?? ''
                }`.trim()
              : '',
        }))
      const rawLines = lines.slice(spec.startLine - 1, spec.endLine)
      const rawText = rawLines.join('\n')
      rows.push({
        id: `${spec.startLine}-${spec.endLine}`,
        startLine: spec.startLine,
        endLine: spec.endLine,
        date: tx.date,
        payee: tx.payee,
        narration: tx.narration,
        tags: tx.tags ?? [],
        debit,
        credit,
        balance: spec.balance ?? '',
        text: rawText,
        otherPostings,
        postedDate: tx.date,
      })
    }
    const net = cSum - dSum
    return {
      statementRows: rows,
      statementTotals: {
        totalDebit: grouped(dSum),
        totalCredit: grouped(cSum),
        netChange: `${net >= 0 ? '+' : '−'}${grouped(net)}`,
        netPositive: net >= 0,
      },
    }
  }, [parsed, cardSpecs, account, currency, text])

  const headerBalance = useMemo(() => {
    if (!currency) return ''
    for (let i = 0; i < cardSpecs.length; i++) {
      const rt = cardSpecs[i]!.runningTotal
      if (rt != null) return formatHeaderBalance(rt, currency)
    }
    return ''
  }, [cardSpecs, currency])

  const { netIn, netOut } = useMemo(() => {
    if (!currency) return { netIn: undefined, netOut: undefined }
    let inSum = 0
    let outSum = 0
    for (const spec of cardSpecs) {
      for (const d of spec.deltas) {
        if (d.flow === 'in') inSum += d.amount
        else outSum += d.amount
      }
    }
    return {
      netIn: formatSignedStat(inSum, currency, '+'),
      netOut: formatSignedStat(outSum, currency, '−'),
    }
  }, [cardSpecs, currency])

  const onRevert = useCallback(() => {
    setText(savedSlice)
    setError(null)
  }, [savedSlice])

  const onSaveRow = useCallback((row: StatementRowData, newText: string) => {
    const all = textRef.current.split('\n')
    const before = all.slice(0, row.startLine - 1)
    const after = all.slice(row.endLine)
    const replaced = newText.split('\n')
    setText([...before, ...replaced, ...after].join('\n'))
  }, [])

  const txnCount = isStrictParseErr(parsed) ? 0 : parsed.transactions.length

  const editorViewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    const view = editorViewRef.current
    if (!view) return
    view.dispatch({ effects: setCardSpecs.of(cardSpecs) })
  }, [cardSpecs])

  const extensions = useMemo(
    () => [
      new LanguageSupport(beancountLang),
      syntaxHighlighting(HIGHLIGHT),
      THEME,
      EditorView.lineWrapping,
      cardDecorations(),
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            void save()
            return true
          },
        },
      ]),
    ],
    [save],
  )

  const body = (
    <div className="h-full flex flex-col min-h-0">
      {error && (
        <div className="mx-6 mb-2 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">
          {error}
        </div>
      )}
      {parseFailed && !error && (
        <div
          data-testid="parse-error-banner"
          className="mx-6 mb-2 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded"
        >
          parse error
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loaded ? (
          <CodeMirror
            value={text}
            extensions={extensions}
            basicSetup={BASIC}
            theme="none"
            editable={!saving}
            onChange={(v) => setText(v)}
            onCreateEditor={(view) => {
              editorViewRef.current = view
              view.dispatch({ effects: setCardSpecs.of(cardSpecs) })
            }}
            height="100%"
            style={{ height: '100%' }}
          />
        ) : (
          <div className="p-4 text-xs text-slate-500">Loading…</div>
        )}
      </div>
    </div>
  )

  const statementBody = (
    <StatementView
      rows={statementRows}
      totalDebit={statementTotals.totalDebit}
      totalCredit={statementTotals.totalCredit}
      netChange={statementTotals.netChange}
      netPositive={statementTotals.netPositive}
      onSaveRow={onSaveRow}
    />
  )

  const breadcrumb = account.split(':').filter(Boolean)
  const accountTitle = shortAccountName(account)

  return (
    <NotebookShell
      breadcrumb={breadcrumb}
      accountTitle={accountTitle}
      accountPath={account}
      balance={headerBalance}
      netIn={netIn}
      netOut={netOut}
      cards={[]}
      txnCount={txnCount}
      unsaved={unsaved}
      saving={saving}
      onSave={save}
      onRevert={onRevert}
      body={body}
      statementBody={statementBody}
      defaultViewMode={defaultViewMode}
      currency={currency}
      currencies={currencies}
      onCurrencyChange={onCurrencyChange}
      leafChips={children}
    />
  )
}
