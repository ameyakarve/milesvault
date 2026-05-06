'use client'

import Link from 'next/link'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@mantine/core'
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

export type LeafChip = string

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
  highlightSelectionMatches: true,
  searchKeymap: true,
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

function StatusBar({ txnCount, cursor }: { txnCount: number; cursor: string }) {
  return (
    <footer className="h-[28px] bg-[#f2f4f6] border-t border-slate-200 flex items-center justify-between px-4 font-mono text-[10px] uppercase tracking-wider text-[#515f74] shrink-0">
      <div className="flex items-center gap-6">
        <span>{cursor}</span>
        <span className="text-[#00685f] font-bold flex items-center gap-1">
          <span className="material-symbols-outlined !text-[12px]">check_circle</span>
          <span>Parsed</span>
        </span>
        <span>{txnCount} txns</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#00685f]" />
          <span>Ready</span>
        </span>
        <span>Beancount v2.3.5</span>
        <span className="material-symbols-outlined !text-[14px]">notifications</span>
      </div>
    </footer>
  )
}

function PopoverMenu({
  options,
  selected,
  onSelect,
  onClose,
}: {
  options: string[]
  selected: string
  onSelect: (next: string) => void
  onClose: () => void
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-transparent cursor-default"
      />
      <div
        role="menu"
        className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded shadow-lg py-1 min-w-[120px]"
      >
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            role="menuitem"
            onClick={() => {
              onSelect(opt)
              onClose()
            }}
            className={`w-full text-left px-3 py-1.5 font-mono text-[11px] hover:bg-slate-50 transition-colors ${
              opt === selected ? 'text-[#00685f] font-bold' : 'text-slate-700'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </>
  )
}

function BreadcrumbRow({
  breadcrumb,
  currency,
  currencies,
  onCurrencyChange,
  period,
  periods,
  onPeriodChange,
}: {
  breadcrumb: string[]
  currency: string | null | undefined
  currencies: string[]
  onCurrencyChange?: (next: string) => void
  period: string
  periods: string[]
  onPeriodChange?: (next: string) => void
}) {
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [periodOpen, setPeriodOpen] = useState(false)
  const canOpenCurrency = !!onCurrencyChange && currencies.length > 1
  const canOpenPeriod = !!onPeriodChange && periods.length > 1
  return (
    <div className="h-10 bg-white px-6 flex items-center justify-between border-b border-slate-50 shrink-0">
      <div className="flex items-center gap-1.5 font-mono text-[11px]">
        <Link
          href="/ledger"
          className="text-slate-500 hover:text-[#00685f] transition-colors"
        >
          Accounts
        </Link>
        {breadcrumb.map((seg, i) => {
          const isLast = i === breadcrumb.length - 1
          const href = `/ledger/${breadcrumb
            .slice(0, i + 1)
            .map(encodeURIComponent)
            .join('/')}`
          return (
            <Fragment key={`${seg}-${i}`}>
              <span className="material-symbols-outlined !text-[12px] text-slate-300">
                chevron_right
              </span>
              {isLast ? (
                <span className="text-slate-800 font-bold">{seg}</span>
              ) : (
                <Link
                  href={href}
                  className="text-slate-500 hover:text-[#00685f] transition-colors"
                >
                  {seg}
                </Link>
              )}
            </Fragment>
          )
        })}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={canOpenPeriod ? () => setPeriodOpen((v) => !v) : undefined}
            aria-haspopup={canOpenPeriod ? 'menu' : undefined}
            aria-expanded={canOpenPeriod ? periodOpen : undefined}
            className="font-mono text-[11px] text-slate-600 hover:text-[#00685f] flex items-center gap-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined !text-[14px] text-slate-400">
              schedule
            </span>
            {period}
            <span className="material-symbols-outlined !text-[14px] -mr-1">
              arrow_drop_down
            </span>
          </button>
          {periodOpen && canOpenPeriod && (
            <PopoverMenu
              options={periods}
              selected={period}
              onSelect={onPeriodChange!}
              onClose={() => setPeriodOpen(false)}
            />
          )}
        </div>
        {currency && (
          <div className="relative">
            <button
              type="button"
              onClick={canOpenCurrency ? () => setCurrencyOpen((v) => !v) : undefined}
              aria-haspopup={canOpenCurrency ? 'menu' : undefined}
              aria-expanded={canOpenCurrency ? currencyOpen : undefined}
              className="font-mono text-[11px] text-slate-600 hover:text-[#00685f] flex items-center"
            >
              {currency}
              <span className="material-symbols-outlined !text-[14px] ml-0.5">
                arrow_drop_down
              </span>
            </button>
            {currencyOpen && canOpenCurrency && (
              <PopoverMenu
                options={currencies}
                selected={currency}
                onSelect={onCurrencyChange!}
                onClose={() => setCurrencyOpen(false)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}


function LeafChipsRow({
  leafChips,
  breadcrumb,
}: {
  leafChips: LeafChip[]
  breadcrumb: string[]
}) {
  if (leafChips.length === 0) return null
  const baseHref = `/ledger/${breadcrumb.map(encodeURIComponent).join('/')}`
  return (
    <div className="h-[44px] bg-[#f2f4f6] px-6 flex items-center justify-between shrink-0">
      <div className="flex-1 mr-4 overflow-x-auto">
        <div className="flex items-center gap-2">
          {leafChips.length > 1 && (
            <Button size="compact-xs" radius="xl" variant="filled" color="#00685f">
              All
            </Button>
          )}
          {leafChips.map((label) => (
            <Button
              key={label}
              component={Link}
              href={`${baseHref}/${encodeURIComponent(label)}`}
              size="compact-xs"
              radius="xl"
              variant="default"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {leafChips.length > 1 && (
        <Button
          size="compact-xs"
          variant="subtle"
          color="#00685f"
          rightSection={<span className="material-symbols-outlined !text-[14px]">arrow_forward</span>}
        >
          Explore tree
        </Button>
      )}
    </div>
  )
}

export type ViewMode = 'overview' | 'statement' | 'editor'

function SubToolbar({
  viewMode,
  onViewModeChange,
  unsaved,
  saving,
  onSave,
  onRevert,
}: {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  unsaved: boolean
  saving: boolean
  onSave?: () => void
  onRevert?: () => void
}) {
  const tabBase = 'h-full px-2 transition-colors'
  const tabActive = 'text-slate-900 border-b-2 border-teal-600 font-bold'
  const tabIdle = 'text-slate-500 hover:text-slate-700'
  return (
    <div className="h-[40px] bg-[#eceef0] px-6 flex items-center justify-between border-b border-slate-200 shrink-0">
      <div className="flex items-center h-full text-[11px] font-medium gap-4">
        <button
          type="button"
          onClick={() => onViewModeChange('overview')}
          className={`${tabBase} ${viewMode === 'overview' ? tabActive : tabIdle}`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('statement')}
          className={`${tabBase} ${viewMode === 'statement' ? tabActive : tabIdle}`}
        >
          Statement
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('editor')}
          className={`${tabBase} ${viewMode === 'editor' ? tabActive : tabIdle}`}
        >
          Editor
        </button>
      </div>
      {viewMode === 'editor' && (
        <div className="flex items-center">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${unsaved ? 'bg-amber-500' : 'bg-transparent'}`}
            />
            <span className="text-[11px] font-medium text-slate-500">
              {unsaved ? 'Unsaved changes' : 'Saved'}
            </span>
          </div>
          <div className="h-4 w-[1px] bg-slate-300 mx-3" />
          <button
            type="button"
            onClick={onRevert}
            disabled={!unsaved || saving}
            className="text-[11px] font-medium text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 rounded-sm px-2 py-1 mr-3 transition-colors disabled:opacity-50"
          >
            Revert
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!unsaved || saving}
            className="bg-teal-600 hover:bg-teal-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] px-3 py-1.5 rounded-sm text-[11px] font-medium flex items-center transition-all duration-200 disabled:opacity-50"
          >
            <span>{saving ? 'Saving…' : 'Save ⌘S'}</span>
          </button>
        </div>
      )}
    </div>
  )
}

export type NotebookShellProps = {
  breadcrumb: string[]
  accountTitle: string
  accountPath: string
  cards: Card[]
  txnCount: number
  unsaved?: boolean
  saving?: boolean
  onSave?: () => void
  onRevert?: () => void
  body?: ReactNode
  statementBody?: ReactNode
  overviewBody?: ReactNode
  defaultViewMode?: ViewMode
  cursor?: string
  currency?: string | null
  currencies?: string[]
  onCurrencyChange?: (next: string) => void
  leafChips?: LeafChip[]
  period?: string
  periods?: string[]
  onPeriodChange?: (next: string) => void
}

export function NotebookShell({
  breadcrumb,
  cards,
  txnCount,
  unsaved = false,
  saving = false,
  onSave,
  onRevert,
  body,
  statementBody,
  overviewBody,
  defaultViewMode = 'overview',
  cursor = 'Ln 1, Col 1',
  currency,
  currencies = [],
  onCurrencyChange,
  leafChips = [],
  period = 'All time',
  periods = [],
  onPeriodChange,
}: NotebookShellProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode)
  return (
    <div className="w-full h-screen flex bg-[#f7f9fb] font-sans text-[#191c1e] overflow-hidden">
      <NavRail />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex min-h-0">
          <main className="flex-1 flex flex-col min-w-0">
            <BreadcrumbRow
              breadcrumb={breadcrumb}
              currency={currency}
              currencies={currencies}
              onCurrencyChange={onCurrencyChange}
              period={period}
              periods={periods}
              onPeriodChange={onPeriodChange}
            />
            <LeafChipsRow leafChips={leafChips} breadcrumb={breadcrumb} />
            <SubToolbar
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              unsaved={unsaved}
              saving={saving}
              onSave={onSave}
              onRevert={onRevert}
            />
            {viewMode === 'overview' ? (
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#eceef0]">
                {overviewBody}
              </div>
            ) : viewMode === 'editor' ? (
              <EditorPane cards={cards} body={body} />
            ) : (
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
                {statementBody}
              </div>
            )}
          </main>
        </div>
        <StatusBar txnCount={txnCount} cursor={cursor} />
      </div>
    </div>
  )
}
