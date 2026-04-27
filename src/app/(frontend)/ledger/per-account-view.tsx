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
import {
  directiveTouchesAccountCurrency,
  txnTouchesAccountCurrency,
} from '@/lib/beancount/scope'
import type { DirectiveInput, TransactionInput } from '@/durable/ledger-types'
import { NotebookShell } from './notebook-shell'

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
  '.cm-line': { padding: '0 12px', lineHeight: '28px' },
  '.cm-line:first-child': { paddingTop: '6px' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-focused': { outline: 'none' },
})

const BASIC = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  highlightSelectionMatches: false,
  searchKeymap: false,
} as const

type JournalGetResponse = { text: string }
type CurrenciesResponse = { currencies: string[] }
type JournalPutOk = { text: string; inserted: number; deleted: number; unchanged: number }
type JournalPutErr = {
  ok: false
  error: 'parse_error' | 'unsupported_directives'
  message: string
  unsupportedTypes?: string[]
}
type JournalPutResp = JournalPutOk | JournalPutErr

function isPutErr(r: JournalPutResp): r is JournalPutErr {
  return 'ok' in r && r.ok === false
}

type Whole = { txns: TransactionInput[]; directives: DirectiveInput[] }

function sliceText(
  whole: Whole,
  account: string,
  currency: string,
): string {
  const txns = whole.txns.filter((tx) => txnTouchesAccountCurrency(tx, account, currency))
  const directives = whole.directives.filter((d) =>
    directiveTouchesAccountCurrency(d, account, currency),
  )
  return serializeJournal(txns, directives)
}

export function PerAccountView({ account }: { account: string }) {
  const [loaded, setLoaded] = useState(false)
  const [whole, setWhole] = useState<Whole | null>(null)
  const [currencies, setCurrencies] = useState<string[]>([])
  const [currency, setCurrency] = useState<string | null>(null)
  const [savedSlice, setSavedSlice] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<
    { inserted: number; deleted: number; unchanged: number } | null
  >(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch('/api/ledger/journal', {
        credentials: 'include',
        signal: controller.signal,
      }).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as JournalGetResponse
      }),
      fetch(`/api/ledger/accounts/${encodeURIComponent(account)}/currencies`, {
        credentials: 'include',
        signal: controller.signal,
      }).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as CurrenciesResponse
      }),
    ])
      .then(([journal, curResp]) => {
        const parsed = parseJournal(journal.text)
        const w: Whole = { txns: parsed.transactions, directives: parsed.directives }
        setWhole(w)
        setCurrencies(curResp.currencies)
        const cur = curResp.currencies[0] ?? null
        setCurrency(cur)
        const initial = cur ? sliceText(w, account, cur) : ''
        setSavedSlice(initial)
        setText(initial)
        setLoaded(true)
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(e instanceof Error ? e.message : String(e))
        setLoaded(true)
      })
    return () => controller.abort()
  }, [account])

  const onCurrencyChange = useCallback(
    (next: string) => {
      if (!whole) return
      setCurrency(next)
      const s = sliceText(whole, account, next)
      setSavedSlice(s)
      setText(s)
      setStats(null)
      setError(null)
    },
    [whole, account],
  )

  const textRef = useRef(text)
  textRef.current = text

  const save = useCallback(async () => {
    if (saving || !whole || !currency) return
    setSaving(true)
    setError(null)
    let parsedSlice
    try {
      parsedSlice = parseJournal(textRef.current)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
      return
    }
    const keepTxns = whole.txns.filter(
      (tx) => !txnTouchesAccountCurrency(tx, account, currency),
    )
    const keepDirectives = whole.directives.filter(
      (d) => !directiveTouchesAccountCurrency(d, account, currency),
    )
    const newWhole: Whole = {
      txns: [...keepTxns, ...parsedSlice.transactions],
      directives: [...keepDirectives, ...parsedSlice.directives],
    }
    const newWholeText = serializeJournal(newWhole.txns, newWhole.directives)
    try {
      const res = await fetch('/api/ledger/journal', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: newWholeText }),
      })
      const data = (await res.json()) as JournalPutResp
      if (!res.ok || isPutErr(data)) {
        const msg = isPutErr(data) ? data.message : `HTTP ${res.status}`
        setError(msg)
        return
      }
      const reparsed = parseJournal(data.text)
      const w: Whole = { txns: reparsed.transactions, directives: reparsed.directives }
      setWhole(w)
      const updated = sliceText(w, account, currency)
      setSavedSlice(updated)
      setText(updated)
      setStats({ inserted: data.inserted, deleted: data.deleted, unchanged: data.unchanged })
      const curResp = await fetch(
        `/api/ledger/accounts/${encodeURIComponent(account)}/currencies`,
        { credentials: 'include' },
      )
      if (curResp.ok) {
        const cur = (await curResp.json()) as CurrenciesResponse
        setCurrencies(cur.currencies)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }, [saving, whole, currency, account])

  const unsaved = loaded && text !== savedSlice
  const lineCount = useMemo(() => Math.max(1, text.split('\n').length), [text])

  const extensions = useMemo(
    () => [
      new LanguageSupport(beancountLang),
      syntaxHighlighting(HIGHLIGHT),
      THEME,
      EditorView.lineWrapping,
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
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
            Currency
          </label>
          {currencies.length > 0 ? (
            <select
              value={currency ?? ''}
              onChange={(e) => onCurrencyChange(e.target.value)}
              className="text-xs font-mono bg-white border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-[#00685f]"
              disabled={saving}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-mono text-slate-400">none yet</span>
          )}
        </div>
        {stats && !error && (
          <span className="text-[10px] text-slate-500 font-mono">
            saved · +{stats.inserted} −{stats.deleted} ={stats.unchanged}
          </span>
        )}
      </div>
      {error && (
        <div className="mb-2 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">
          {error}
        </div>
      )}
      <div className="flex-1 bg-white rounded-sm shadow-sm border border-[#bcc9c6]/15 overflow-hidden">
        {loaded ? (
          <CodeMirror
            value={text}
            extensions={extensions}
            basicSetup={BASIC}
            editable={!saving}
            onChange={(v) => setText(v)}
            height="100%"
          />
        ) : (
          <div className="p-4 text-xs text-slate-500">Loading…</div>
        )}
      </div>
    </div>
  )

  const gutter = (
    <>
      {Array.from({ length: lineCount }, (_, i) => (
        <span key={i} className="pr-2">
          {i + 1}
        </span>
      ))}
    </>
  )

  const breadcrumb = account.split(':').filter(Boolean)
  const accountTitle = shortAccountName(account)

  return (
    <NotebookShell
      breadcrumb={breadcrumb}
      accountTitle={accountTitle}
      accountPath={account}
      balance=""
      cards={[]}
      txnCount={0}
      unsaved={unsaved}
      saving={saving}
      onSave={save}
      body={body}
      gutter={gutter}
    />
  )
}
