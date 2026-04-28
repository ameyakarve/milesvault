'use client'

import { Fragment, useMemo, useState } from 'react'
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

export type StatementOtherPosting = {
  account: string
  amountSigned: string
}

export type StatementRowData = {
  id: string
  date: string
  payee?: string
  narration?: string
  tags?: string[]
  debit: string | null
  credit: string | null
  balance: string
  text: string
  draftText?: string
  otherPostings: StatementOtherPosting[]
  reconciled?: boolean
  txnHash?: string
  postedDate?: string
}

export type StatementViewProps = {
  rows: StatementRowData[]
  totalDebit: string
  totalCredit: string
  netChange: string
  netPositive: boolean
  initialExpandedId?: string | null
  onSaveRow?: (id: string, text: string) => void | Promise<void>
  onAiRow?: (id: string) => void
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

const ROW_HIGHLIGHT = HighlightStyle.define([
  { tag: t.literal, color: '#00685f' },
  { tag: t.operator, color: '#191c1e', fontWeight: '700' },
  { tag: t.string, color: '#57657a' },
  { tag: t.variableName, color: '#191c1e' },
  { tag: t.number, color: '#3d4947', fontWeight: '700' },
  { tag: t.unit, color: '#515f74' },
])

const ROW_THEME = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', monospace",
  },
  '.cm-scroller': { fontFamily: "'JetBrains Mono', monospace" },
  '.cm-content': { padding: '8px 0', caretColor: '#191c1e' },
  '.cm-line': { padding: '0 12px', lineHeight: '22px' },
  '.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: '#fffbe6' },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: '#00685f',
    fontWeight: '700',
    boxShadow: 'inset -2px 0 0 0 #00685f',
  },
  '.cm-gutters': {
    backgroundColor: '#f8fafc',
    borderRight: '1px solid #f1f5f9',
    color: '#cbd5e1',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    lineHeight: '22px',
    padding: '8px 0',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    display: 'flex',
    justifyContent: 'flex-end',
    minWidth: '20px',
    paddingRight: '8px',
  },
})

const ROW_BASIC = {
  lineNumbers: true,
  foldGutter: false,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  highlightSelectionMatches: false,
  searchKeymap: false,
} as const

export function StatementView({
  rows,
  totalDebit,
  totalCredit,
  netChange,
  netPositive,
  initialExpandedId = null,
  onSaveRow,
  onAiRow,
}: StatementViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId)
  return (
    <div className="flex-1 flex flex-col bg-white min-h-0 overflow-hidden">
      <StatementHeader />
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
        {rows.map((row, idx) => (
          <Fragment key={row.id}>
            {expandedId === row.id ? (
              <StatementRowExpanded
                row={row}
                onCollapse={() => setExpandedId(null)}
                onSave={onSaveRow}
                onAi={onAiRow}
              />
            ) : (
              <StatementRow
                row={row}
                odd={idx % 2 === 1}
                onExpand={() => setExpandedId(row.id)}
              />
            )}
          </Fragment>
        ))}
      </div>
      <StatementFooter
        totalDebit={totalDebit}
        totalCredit={totalCredit}
        netChange={netChange}
        netPositive={netPositive}
      />
    </div>
  )
}

function StatementHeader() {
  return (
    <div className="h-[32px] bg-[#f2f4f6] flex items-center border-b border-slate-200 text-[9px] uppercase tracking-widest text-slate-400 font-bold shrink-0">
      <div className="w-[24px]" />
      <div className="w-[96px] px-2">DATE</div>
      <div className="flex-1 px-2">ENTRY</div>
      <div className="w-[120px] px-2 text-right">DEBIT</div>
      <div className="w-[120px] px-2 text-right">CREDIT</div>
      <div className="w-[130px] px-2 text-right border-l border-slate-200 h-full flex items-center justify-end">
        BALANCE
      </div>
    </div>
  )
}

function StatementRow({
  row,
  odd,
  onExpand,
}: {
  row: StatementRowData
  odd: boolean
  onExpand: () => void
}) {
  return (
    <div
      onClick={onExpand}
      className={`flex items-center h-[44px] shrink-0 border-b border-slate-100 ${
        odd ? 'bg-[#fafaf8]' : 'bg-white'
      } hover:bg-slate-50 group cursor-pointer`}
    >
      <div className="w-[24px] flex items-center justify-center text-slate-300 group-hover:text-slate-500">
        <span className="material-symbols-outlined !text-[16px]">chevron_right</span>
      </div>
      <div className="w-[96px] px-2 font-mono text-[11px] text-slate-700">{row.date}</div>
      <div className="flex-1 px-2 flex flex-col justify-center overflow-hidden">
        <span className="text-[13px] font-medium text-slate-900 truncate">
          {row.payee ?? row.narration ?? ''}
        </span>
        {row.narration && row.payee && (
          <span className="text-[11px] text-slate-500 truncate mt-0.5">{row.narration}</span>
        )}
      </div>
      <div className="w-[120px] px-2 font-mono text-[12px] text-slate-700 text-right">
        {row.debit ?? ' '}
      </div>
      <div
        className={`w-[120px] px-2 font-mono text-[12px] text-right ${
          row.credit ? 'text-[#00685f]' : 'text-slate-400'
        }`}
      >
        {row.credit ?? ' '}
      </div>
      <div className="w-[130px] px-2 font-mono text-[12px] text-slate-900 text-right border-l border-slate-100 h-full flex items-center justify-end">
        {row.balance}
      </div>
    </div>
  )
}

function StatementRowExpanded({
  row,
  onCollapse,
  onSave,
  onAi,
}: {
  row: StatementRowData
  onCollapse: () => void
  onSave?: (id: string, text: string) => void | Promise<void>
  onAi?: (id: string) => void
}) {
  return (
    <div className="flex flex-col shrink-0 border-b border-slate-200 bg-[#00685f]/5">
      <div onClick={onCollapse} className="flex items-center h-[44px] shrink-0 cursor-pointer">
        <div className="w-[24px] flex items-center justify-center text-slate-500">
          <span className="material-symbols-outlined !text-[16px]">expand_more</span>
        </div>
        <div className="w-[96px] px-2 font-mono text-[11px] text-slate-700">{row.date}</div>
        <div className="flex-1 px-2 flex flex-col justify-center overflow-hidden">
          <span className="text-[13px] font-medium text-slate-900 truncate">
            {row.payee ?? row.narration ?? ''}
          </span>
          {row.narration && row.payee && (
            <span className="text-[11px] text-slate-500 truncate mt-0.5">{row.narration}</span>
          )}
        </div>
        <div className="w-[120px] px-2 font-mono text-[12px] text-slate-400 text-right">
          {row.debit ?? ' '}
        </div>
        <div
          className={`w-[120px] px-2 font-mono text-[12px] text-right ${
            row.credit ? 'text-[#00685f]' : 'text-slate-400'
          }`}
        >
          {row.credit ?? ' '}
        </div>
        <div className="w-[130px] px-2 font-mono text-[12px] text-slate-900 text-right border-l border-slate-200/50 h-full flex items-center justify-end">
          {row.balance}
        </div>
      </div>
      <div className="flex flex-col pb-3">
        <div className="pl-[56px] pr-4 py-2 border-t border-slate-200/50 flex items-center text-[10px] font-mono text-slate-400 gap-2">
          <span>POSTED {row.postedDate ?? row.date}</span>
          <span>·</span>
          <span>TXN #{row.txnHash ?? '00000000'}</span>
          {row.reconciled && (
            <>
              <span>·</span>
              <span className="text-[#00685f] font-semibold">RECONCILED</span>
            </>
          )}
        </div>
        <StatementRowEditor row={row} onSave={onSave} onAi={onAi} />
      </div>
    </div>
  )
}

function StatementRowEditor({
  row,
  onSave,
  onAi,
}: {
  row: StatementRowData
  onSave?: (id: string, text: string) => void | Promise<void>
  onAi?: (id: string) => void
}) {
  const [text, setText] = useState(row.draftText ?? row.text)
  const [busy, setBusy] = useState(false)
  const dirty = text !== row.text

  const extensions = useMemo(
    () => [new LanguageSupport(beancountLang), syntaxHighlighting(ROW_HIGHLIGHT), ROW_THEME],
    [],
  )

  const handleSave = async () => {
    if (!dirty || busy) return
    setBusy(true)
    try {
      await onSave?.(row.id, text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ml-[56px] mr-4 mb-4 bg-white border border-slate-200 rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col">
      <CodeMirror
        value={text}
        extensions={extensions}
        basicSetup={ROW_BASIC}
        theme="none"
        editable={!busy}
        onChange={(v) => setText(v)}
      />
      <div className="bg-slate-50 border-t border-slate-100 px-3 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-h-[16px]">
          {dirty && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-tight">
                Edited
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onAi?.(row.id)}
            className="flex items-center text-[11px] font-medium text-slate-500 hover:text-[#00685f] transition-colors"
          >
            <span className="material-symbols-outlined !text-[14px] mr-1">auto_awesome</span>
            Edit with AI
          </button>
          <button
            type="button"
            onClick={() => setText(row.text)}
            disabled={!dirty || busy}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty || busy}
            className="bg-[#00685f] text-white px-3 py-1 rounded-sm text-[11px] font-bold flex items-center gap-2 hover:bg-[#005049] transition-colors disabled:opacity-50"
          >
            <span>{busy ? 'Saving…' : 'Save'}</span>
            <span className="opacity-50 font-normal">⌘S</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function StatementFooter({
  totalDebit,
  totalCredit,
  netChange,
  netPositive,
}: {
  totalDebit: string
  totalCredit: string
  netChange: string
  netPositive: boolean
}) {
  return (
    <div className="h-[44px] bg-[#f2f4f6] flex items-center border-t border-slate-200 shrink-0">
      <div className="w-[24px]" />
      <div className="w-[96px] px-2" />
      <div className="flex-1 px-2 text-[9px] uppercase tracking-widest text-slate-500 font-bold">
        PERIOD TOTALS
      </div>
      <div className="w-[120px] px-2 font-mono text-[12px] text-slate-700 text-right">
        {totalDebit}
      </div>
      <div className="w-[120px] px-2 font-mono text-[12px] text-slate-700 text-right">
        {totalCredit}
      </div>
      <div
        className={`w-[130px] px-2 font-mono text-[12px] font-bold text-right border-l border-slate-200 h-full flex items-center justify-end ${
          netPositive ? 'text-[#00685f]' : 'text-rose-600'
        }`}
      >
        {netChange}
      </div>
    </div>
  )
}
