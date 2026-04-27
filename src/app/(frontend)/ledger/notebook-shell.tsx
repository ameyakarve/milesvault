'use client'

import Link from 'next/link'
import { Fragment, useMemo, type ReactNode } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import {
  HighlightStyle,
  LRLanguage,
  LanguageSupport,
  syntaxHighlighting,
} from '@codemirror/language'
import { styleTags, tags as t } from '@lezer/highlight'
import { parser as beancountParser } from 'lezer-beancount'
import { NavRail } from '../_chrome/nav-rail'

export type Seg =
  | { kind: 'date'; text: string }
  | { kind: 'flag'; text: string }
  | { kind: 'payee'; text: string }
  | { kind: 'narration'; text: string }
  | { kind: 'account'; text: string }
  | { kind: 'number'; text: string }
  | { kind: 'currency'; text: string }
  | { kind: 'ws'; text: string }

export type Delta = { sign: '+' | '−'; value: string; flow: 'in' | 'out' }

export type SourceLine = {
  lineNo: number
  segs: Seg[]
  delta?: Delta
  active?: boolean
}

export type Card = {
  id: string
  lines: SourceLine[]
  balance: string | null
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

const SOURCE_HIGHLIGHT = HighlightStyle.define([
  { tag: t.literal, color: '#00685f' },
  { tag: t.operator, color: '#191c1e', fontWeight: '700' },
  { tag: t.string, color: '#57657a' },
  { tag: t.variableName, color: '#191c1e' },
  { tag: t.number, color: '#3d4947', fontWeight: '700' },
  { tag: t.unit, color: '#515f74' },
])

const SOURCE_THEME = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', monospace",
  },
  '.cm-scroller': { fontFamily: "'JetBrains Mono', monospace" },
  '.cm-content': {
    padding: '0',
    caretColor: '#00685f',
  },
  '.cm-line': {
    padding: '0 12px',
    lineHeight: '28px',
    position: 'relative',
  },
  '.cm-line:first-child': {
    paddingTop: '6px',
  },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-focused': { outline: 'none' },
  '.cm-delta-inlay': {
    position: 'absolute',
    right: '12px',
    top: '0',
    fontSize: '10px',
    fontFamily: "'JetBrains Mono', monospace",
    fontStyle: 'italic',
    color: '#94a3b8',
    pointerEvents: 'none',
  },
  '.cm-delta-out': { color: 'rgba(251, 113, 133, 0.7)' },
  '.cm-delta-in': { color: 'rgba(20, 184, 166, 0.7)' },
})

const EDITOR_BASIC = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  highlightSelectionMatches: false,
  searchKeymap: false,
} as const

class DeltaWidget extends WidgetType {
  constructor(readonly delta: Delta) {
    super()
  }
  eq(other: DeltaWidget) {
    return (
      this.delta.sign === other.delta.sign &&
      this.delta.value === other.delta.value &&
      this.delta.flow === other.delta.flow
    )
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-delta-inlay'
    const colorCls = this.delta.flow === 'out' ? 'cm-delta-out' : 'cm-delta-in'
    const inner = document.createElement('span')
    inner.className = colorCls
    inner.textContent = `${this.delta.sign}${this.delta.value}`
    el.appendChild(document.createTextNode('→ '))
    el.appendChild(inner)
    return el
  }
  ignoreEvent() {
    return true
  }
}

function buildDeltaDecorations(view: EditorView, deltasByLine: Map<number, Delta>): DecorationSet {
  const ranges: Array<ReturnType<typeof Decoration.widget>['range'] extends (n: number) => infer R ? R : never> = []
  for (const [lineNum, delta] of deltasByLine) {
    if (lineNum < 1 || lineNum > view.state.doc.lines) continue
    const line = view.state.doc.line(lineNum)
    ranges.push(Decoration.widget({ widget: new DeltaWidget(delta), side: 1 }).range(line.to))
  }
  return Decoration.set(ranges, true)
}

function deltaPlugin(deltasByLine: Map<number, Delta>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = buildDeltaDecorations(view, deltasByLine)
      }
      update(u: ViewUpdate) {
        if (u.docChanged) this.decorations = buildDeltaDecorations(u.view, deltasByLine)
      }
    },
    { decorations: (v) => v.decorations },
  )
}

function lineToSource(line: SourceLine): string {
  return line.segs.map((s) => s.text).join('')
}

function CardBlock({ card }: { card: Card }) {
  const sourceText = useMemo(() => card.lines.map(lineToSource).join('\n'), [card.lines])
  const deltas = useMemo(() => {
    const m = new Map<number, Delta>()
    card.lines.forEach((l, i) => {
      if (l.delta) m.set(i + 1, l.delta)
    })
    return m
  }, [card.lines])
  const extensions = useMemo(
    () => [
      new LanguageSupport(beancountLang),
      syntaxHighlighting(SOURCE_HIGHLIGHT),
      SOURCE_THEME,
      deltaPlugin(deltas),
      EditorView.lineWrapping,
    ],
    [deltas],
  )
  return (
    <div className="flex flex-col bg-white rounded-sm shadow-sm border border-[#bcc9c6]/15">
      <CodeMirror
        value={sourceText}
        extensions={extensions}
        basicSetup={EDITOR_BASIC}
        editable
      />
      {card.balance != null && (
        <div className="h-4 flex items-center justify-end pr-4 mb-1.5">
          <span className="text-[10px] font-mono text-slate-500">
            <span className="text-slate-400">bal </span>
            {card.balance}
          </span>
        </div>
      )}
    </div>
  )
}

function GutterRow({ line }: { line: SourceLine }) {
  if (line.active) {
    return (
      <span className="relative w-full flex justify-end pr-2 text-[#00685f]">
        <span className="absolute right-0 top-0 bottom-0 w-[2px] bg-[#00685f]" />
        {line.lineNo}
      </span>
    )
  }
  return <span className="pr-2">{line.lineNo}</span>
}

function EditorPane({ cards, body }: { cards: Card[]; body?: ReactNode }) {
  if (body) {
    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#eceef0]">
        {body}
      </div>
    )
  }
  return (
    <div className="flex-1 flex overflow-hidden bg-[#eceef0]">
      <div className="w-10 shrink-0 bg-[#e0e3e5] border-r border-slate-200/30 py-4 font-mono text-[11px] leading-[28px] flex flex-col items-end text-[#bcc9c6]">
        {cards.map((card, ci) => (
          <Fragment key={card.id}>
            {card.lines.map((line) => (
              <GutterRow key={line.lineNo} line={line} />
            ))}
            {ci < cards.length - 1 && (
              <span className="pr-2 opacity-0">{card.lines[card.lines.length - 1]!.lineNo + 1}</span>
            )}
          </Fragment>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto py-4 px-6">
        <div className="flex flex-col space-y-4">
          {cards.map((card) => (
            <CardBlock key={card.id} card={card} />
          ))}
        </div>
      </div>
    </div>
  )
}

const SUGGESTED_PROMPTS: Array<{ icon: string; text: string }> = [
  { icon: 'analytics', text: '"Summarize my coffee spending"' },
  { icon: 'auto_fix', text: '"Clean up payee names in this month"' },
  { icon: 'balance', text: '"Find unbalanced transactions"' },
]

function AiPane() {
  return (
    <aside className="w-[320px] shrink-0 bg-slate-50 border-l border-slate-200 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
        <div className="px-4 py-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#0D9488] !text-[16px]">auto_awesome</span>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-900">
            AI Manuscript Assistant
          </h2>
        </div>
        <div className="flex-1 flex flex-col justify-center px-6 text-center">
          <div className="mb-6">
            <p className="text-xs text-[#515f74] leading-relaxed mb-4">
              Ask AI to balance a transaction, summarize spending, or rewrite narrations.
            </p>
            <div className="flex flex-col space-y-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p.text}
                  type="button"
                  className="text-[11px] py-1.5 px-3 bg-white border border-slate-200 rounded text-[#3d4947] hover:border-[#00685f] transition-colors text-left flex items-center"
                >
                  <span className="material-symbols-outlined !text-[14px] mr-2 text-[#bcc9c6]">
                    {p.icon}
                  </span>
                  {p.text}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
          <div className="relative bg-slate-50 rounded border border-slate-200 focus-within:border-[#00685f]/50 transition-colors">
            <textarea
              placeholder="Ask AI about this ledger..."
              className="w-full bg-transparent border-none rounded p-3 h-24 resize-none text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <button type="button" className="p-1.5 text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined !text-[20px]">mic</span>
              </button>
              <button
                type="button"
                className="p-1.5 text-[#0D9488] hover:text-[#008378]"
                aria-label="Send"
              >
                <span
                  className="material-symbols-outlined !text-[20px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  send
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function StatusBar({ txnCount, cursor }: { txnCount: number; cursor: string }) {
  return (
    <footer className="h-[28px] bg-[#f2f4f6] border-t border-slate-200 flex items-center justify-between px-4 font-mono text-[10px] uppercase tracking-wider text-[#515f74] shrink-0">
      <div className="flex items-center gap-6">
        <span>{cursor}</span>
        <span className="text-[#0D9488] font-bold flex items-center gap-1">
          <span className="material-symbols-outlined !text-[12px]">check_circle</span>
          <span>Parsed</span>
        </span>
        <span>{txnCount} txns</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
          <span>Ready</span>
        </span>
        <span>Beancount v2.3.5</span>
        <span className="material-symbols-outlined !text-[14px]">notifications</span>
      </div>
    </footer>
  )
}

export type NotebookShellProps = {
  breadcrumb: string[]
  accountTitle: string
  accountPath: string
  balance: string
  cards: Card[]
  txnCount: number
  unsaved?: boolean
  saving?: boolean
  onSave?: () => void
  body?: ReactNode
  cursor?: string
}

export function NotebookShell({
  breadcrumb,
  accountTitle,
  accountPath,
  balance,
  cards,
  txnCount,
  unsaved = false,
  saving = false,
  onSave,
  body,
  cursor = 'Ln 1, Col 1',
}: NotebookShellProps) {
  return (
    <div className="w-full h-screen flex bg-[#f7f9fb] font-sans text-[#191c1e] overflow-hidden">
      <NavRail />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 bg-white border-b border-slate-100 px-6 flex items-center justify-between shrink-0">
          <div className="text-sm flex items-center gap-2 tracking-tight">
            <Link
              href="/"
              className="text-[#515f74] hover:text-[#00685f] transition-colors"
            >
              Ledger
            </Link>
            {breadcrumb.slice(0, -1).map((seg, i) => (
              <Fragment key={`${seg}-${i}`}>
                <span className="text-[#bcc9c6]">/</span>
                <Link
                  href={`/ledger/${breadcrumb.slice(0, i + 1).map(encodeURIComponent).join('/')}`}
                  className="text-[#515f74] hover:text-[#00685f] transition-colors"
                >
                  {seg}
                </Link>
              </Fragment>
            ))}
            {breadcrumb.length > 0 && (
              <>
                <span className="text-[#bcc9c6]">/</span>
                <span className="text-[#191c1e] font-medium">
                  {breadcrumb[breadcrumb.length - 1]}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            {unsaved && <span className="text-xs text-slate-500">Unsaved Changes</span>}
            <button
              type="button"
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] flex items-center gap-2 transition-all duration-200 disabled:opacity-50"
              disabled={!unsaved || saving}
              onClick={onSave}
            >
              <span>{saving ? 'Saving…' : 'Save ⌘S'}</span>
            </button>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          <main className="flex-1 flex flex-col min-w-0">
            <section className="h-16 bg-[#f2f4f6] px-8 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex flex-col">
                <h1 className="text-lg font-bold text-[#191c1e] leading-tight">{accountTitle}</h1>
                <span className="font-mono text-[10px] text-[#515f74] tracking-tight">{accountPath}</span>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-2xl text-[#191c1e]">{balance}</div>
              </div>
            </section>

            <EditorPane cards={cards} body={body} />
          </main>

          <AiPane />
        </div>

        <StatusBar txnCount={txnCount} cursor={cursor} />
      </div>
    </div>
  )
}
