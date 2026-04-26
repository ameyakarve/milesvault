'use client'

import { useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { LRLanguage, LanguageSupport, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { styleTags, tags as t } from '@lezer/highlight'
import { parser as beancountParser } from 'lezer-beancount'

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
  { tag: t.literal, color: '#0d9488' },
  { tag: t.operator, color: '#334155' },
  { tag: t.string, color: '#334155' },
  { tag: t.variableName, color: '#334155' },
  { tag: t.number, color: '#0f172a', fontWeight: '700' },
  { tag: t.unit, color: '#64748b' },
])

const SOURCE_THEME = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    fontSize: '12.5px',
    fontFamily: "'JetBrains Mono', monospace",
  },
  '.cm-content': {
    padding: '0',
    lineHeight: '1.6',
    fontFamily: "'JetBrains Mono', monospace",
    caretColor: '#0d9488',
  },
  '.cm-line': { padding: '0' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-focused': { outline: 'none' },
})

const SOURCE_EXTENSIONS = [new LanguageSupport(beancountLang), syntaxHighlighting(SOURCE_HIGHLIGHT)]

const INITIAL_SOURCE = `2024-04-18 * "Lufthansa" "LH761 BLR-FRA"
  Expenses:Travel:Airfare                 38,420.00 INR
  Liabilities:CreditCard:HDFC:DinersBlack`

type Row = {
  date: string
  payee: string
  narration: string
  debit: string | null
  credit: string | null
  balance: string
  expandable?: boolean
}

const ROWS: Row[] = [
  { date: 'Apr 22', payee: 'Amazon', narration: 'Groceries', debit: '2,340.00', credit: null, balance: '-47,820.00' },
  { date: 'Apr 20', payee: 'HDFC', narration: 'Statement payment', debit: null, credit: '35,000.00', balance: '-45,480.00' },
  { date: 'Apr 18', payee: 'Lufthansa', narration: 'LH761 BLR-FRA', debit: '38,420.00', credit: null, balance: '-80,480.00', expandable: true },
  { date: 'Apr 15', payee: 'HDFC', narration: 'Cashback credit', debit: null, credit: '120.00', balance: '-42,060.00' },
  { date: 'Apr 10', payee: 'Swiggy', narration: 'Dining', debit: '890.00', credit: null, balance: '-42,180.00' },
  { date: 'Apr 05', payee: 'HDFC', narration: 'Annual fee', debit: '10,000.00', credit: null, balance: '-41,290.00' },
  { date: 'Mar 30', payee: 'Uber', narration: 'Dining', debit: '540.00', credit: null, balance: '-31,290.00' },
  { date: 'Mar 28', payee: 'BookMyShow', narration: 'Entertainment', debit: '1,200.00', credit: null, balance: '-30,750.00' },
]

const GRID_STYLE = { gridTemplateColumns: '24px 100px 1fr 120px 120px 140px' } as const

const EDITOR_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  highlightSelectionMatches: false,
} as const

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

export function PerAccountView() {
  const [source, setSource] = useState(INITIAL_SOURCE)
  const [expanded, setExpanded] = useState<Set<number>>(new Set([2]))

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className="w-full h-screen flex bg-slate-50 font-sans text-black">
      <nav className="bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-6 w-[64px] shrink-0">
        <div className="w-8 h-8 bg-teal-500 flex items-center justify-center rounded-md text-white font-black text-lg">M</div>
        <div className="flex flex-col gap-4">
          <button className="p-2 text-slate-400 hover:text-teal-500 transition-colors">
            <Icon name="dashboard" />
          </button>
          <button className="p-2 text-slate-400 hover:text-teal-500 transition-colors">
            <Icon name="analytics" />
          </button>
          <button className="p-2 text-slate-400 hover:text-teal-500 transition-colors">
            <Icon name="lightbulb" />
          </button>
          <button className="p-2 bg-teal-50 text-teal-600 border-r-2 border-teal-500">
            <Icon name="account_balance" />
          </button>
        </div>
        <div className="mt-auto flex flex-col items-center pb-2">
          <div className="w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center text-white text-[12px] font-bold">f</div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="h-[56px] bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-[13px] flex items-center gap-2">
              <span className="text-slate-500">Ledger</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-500">Liabilities</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-500">CreditCard</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-700">HDFC</span>
            </div>
            <button className="flex items-center gap-1 bg-white border border-slate-200 rounded h-[32px] px-3 text-[13px] font-medium text-slate-900 hover:bg-slate-50">
              HDFC Diners Black
              <Icon name="expand_more" className="!text-[16px] text-slate-500" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-1.5 hover:bg-slate-100 rounded text-slate-500">
              <Icon name="search" className="!text-[20px]" />
            </button>
            <button className="p-1.5 hover:bg-slate-100 rounded text-slate-500">
              <Icon name="settings" className="!text-[20px]" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="font-bold text-[18px] text-slate-900 leading-none">HDFC Diners Black</h1>
              <div className="font-mono text-[12px] text-slate-400 leading-none">Liabilities:CreditCard:HDFC:DinersBlack</div>
            </div>
            <div className="font-mono font-bold text-[28px] text-slate-900 leading-none">-₹47,820.00</div>
          </div>
        </div>

        <div className="h-[40px] bg-teal-50 border border-slate-200 px-6 flex items-center justify-between shrink-0 text-teal-700">
          <div className="text-[12px] text-slate-500">Unsaved changes · last saved 14:32</div>
          <div className="flex items-center gap-3">
            <button className="border border-slate-300 bg-white text-slate-700 text-[13px] font-medium hover:bg-slate-50 px-3 py-1 rounded-sm shadow-sm">Revert</button>
            <button className="bg-teal-600 hover:bg-teal-700 text-white text-[13px] font-medium px-3 py-1 rounded-sm shadow-sm flex items-center gap-1">
              <span>Save</span>
              <span className="text-[11px] bg-teal-700 px-1.5 py-0.5 rounded-sm ml-1.5">⌘S</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-white">
          <div className="min-w-[800px]">
            <div
              className="grid px-6 py-2 bg-slate-50/50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-widest text-slate-500"
              style={GRID_STYLE}
            >
              <div />
              <div>DATE</div>
              <div>PAYEE · NARRATION</div>
              <div className="text-right">DEBIT</div>
              <div className="text-right">CREDIT</div>
              <div className="text-right">BALANCE</div>
            </div>

            {ROWS.map((row, i) => {
              const isExpanded = expanded.has(i)
              return (
                <div key={i} className={isExpanded ? 'bg-white border-b border-slate-100 shadow-sm' : ''}>
                  <div
                    className={`grid px-6 py-3 items-center cursor-pointer group hover:bg-slate-50 ${
                      isExpanded ? '' : 'border-b border-slate-100'
                    }`}
                    style={GRID_STYLE}
                    onClick={() => row.expandable && toggle(i)}
                  >
                    <div className={`leading-none ${isExpanded ? 'text-teal-500' : 'text-slate-400 group-hover:text-slate-600'}`}>
                      <Icon
                        name={isExpanded ? 'expand_more' : 'chevron_right'}
                        className={`!text-[18px] ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </div>
                    <div className="font-mono text-[13px] text-slate-400">{row.date}</div>
                    <div className="text-[13px] truncate">
                      <span className="font-bold text-slate-800">{row.payee}</span>{' '}
                      <span className="text-slate-500">· {row.narration}</span>
                    </div>
                    <div className={`font-mono text-[13px] text-right ${row.debit ? 'text-slate-900' : 'text-slate-400'}`}>
                      {row.debit ?? '—'}
                    </div>
                    <div className={`font-mono text-[13px] text-right ${row.credit ? 'text-teal-600' : 'text-slate-400'}`}>
                      {row.credit ?? '—'}
                    </div>
                    <div className="font-mono text-[13px] text-right text-slate-600">{row.balance}</div>
                  </div>

                  {isExpanded && (
                    <div className="ml-[56px] mr-6 mb-4 bg-slate-50 border border-slate-200 rounded-sm p-5">
                      <CodeMirror
                        value={source}
                        onChange={setSource}
                        theme={SOURCE_THEME}
                        basicSetup={EDITOR_SETUP}
                        extensions={SOURCE_EXTENSIONS}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            <div className="py-6 flex justify-center text-slate-400 font-mono text-[11px]">↓ 39 more</div>
          </div>
        </div>
      </main>

      <aside className="w-[360px] bg-slate-50 border-l border-slate-200 flex flex-col shrink-0">
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="w-[80%] h-[120px] border-2 border-dashed border-slate-300 rounded mx-auto flex items-center justify-center text-slate-300 text-[13px]">
            AI assistant coming soon
          </div>
        </div>
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="flex items-end bg-white border border-slate-200 rounded p-2 focus-within:ring-1 focus-within:ring-teal-500 focus-within:border-teal-500">
            <textarea
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none resize-none text-[13px] text-slate-700 placeholder-slate-400 p-1"
              placeholder="Ask AI about this ledger..."
              rows={1}
            />
            <div className="flex items-center gap-1 ml-2 shrink-0">
              <button className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded leading-none">
                <Icon name="mic" className="!text-[18px]" />
              </button>
              <button className="p-1.5 text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded leading-none">
                <Icon name="send" className="!text-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
