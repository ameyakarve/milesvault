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

export function PerAccountView({ account }: { account: string }) {
  const [loaded, setLoaded] = useState(false)
  const [savedText, setSavedText] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<{ inserted: number; deleted: number; unchanged: number } | null>(
    null,
  )

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/ledger/journal', { credentials: 'include', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as JournalGetResponse
      })
      .then((data) => {
        setSavedText(data.text)
        setText(data.text)
        setLoaded(true)
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(e instanceof Error ? e.message : String(e))
        setLoaded(true)
      })
    return () => controller.abort()
  }, [])

  const textRef = useRef(text)
  textRef.current = text

  const save = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/ledger/journal', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: textRef.current }),
      })
      const data = (await res.json()) as JournalPutResp
      if (!res.ok || isPutErr(data)) {
        const msg = isPutErr(data) ? data.message : `HTTP ${res.status}`
        setError(msg)
        return
      }
      setSavedText(data.text)
      setText(data.text)
      setStats({ inserted: data.inserted, deleted: data.deleted, unchanged: data.unchanged })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }, [saving])

  const unsaved = loaded && text !== savedText
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
      {error && (
        <div className="mb-2 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">
          {error}
        </div>
      )}
      {stats && !error && (
        <div className="mb-2 px-3 py-1 text-[10px] text-slate-500 font-mono">
          saved · +{stats.inserted} −{stats.deleted} ={stats.unchanged}
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
