'use client'

import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
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

const SEG_CLASS: Record<Seg['kind'], string> = {
  date: 'text-[#00685f]',
  flag: 'font-bold text-[#191c1e]',
  payee: 'text-[#57657a]',
  narration: 'text-[#515f74]',
  account: 'text-[#191c1e]',
  number: 'text-[#3d4947] font-bold',
  currency: 'text-[#515f74]',
  ws: '',
}

function SourceText({ segs }: { segs: Seg[] }) {
  return (
    <span className="whitespace-pre">
      {segs.map((s, i) => (
        <span key={i} className={SEG_CLASS[s.kind]}>
          {s.text}
        </span>
      ))}
    </span>
  )
}

function DeltaInlay({ delta }: { delta: Delta }) {
  const colorCls = delta.flow === 'out' ? 'text-rose-400/70' : 'text-teal-500/70'
  return (
    <span className="text-[10px] font-mono italic text-slate-400 ml-6">
      → <span className={colorCls}>{delta.sign === '−' ? '−' : '+'}{delta.value}</span>
    </span>
  )
}

function CardBlock({ card }: { card: Card }) {
  return (
    <div className="flex flex-col bg-white rounded-sm shadow-sm border border-[#bcc9c6]/15">
      {card.lines.map((line, i) => (
        <div
          key={line.lineNo}
          className={`px-3 leading-[28px] flex justify-between ${i === 0 ? 'pt-1.5' : ''}`}
        >
          <SourceText segs={line.segs} />
          {line.delta && <DeltaInlay delta={line.delta} />}
        </div>
      ))}
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
  return (
    <div className="flex-1 flex overflow-hidden bg-[#eceef0]">
      <div className="w-10 shrink-0 bg-[#e0e3e5] border-r border-slate-200/30 py-4 font-mono text-[11px] leading-[28px] flex flex-col items-end text-[#bcc9c6]">
        {cards.map((card, ci) => (
          <Fragment key={card.id}>
            {card.lines.map((line) => (
              <GutterRow key={line.lineNo} line={line} />
            ))}
            {card.balance != null && <span className="h-[22px] block" />}
            {ci < cards.length - 1 && <span className="h-4 block" />}
          </Fragment>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto py-4 px-6 font-mono text-[13px]">
        {body ?? (
          <div className="flex flex-col space-y-4">
            {cards.map((card) => (
              <CardBlock key={card.id} card={card} />
            ))}
          </div>
        )}
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
    <aside className="w-[320px] shrink-0 bg-slate-50 border-l border-slate-200 flex flex-col overflow-hidden pb-7">
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

function StatusBar({ txnCount }: { txnCount: number }) {
  return (
    <footer className="h-[28px] bg-[#f2f4f6] border-t border-slate-200 flex items-center justify-between px-4 font-mono text-[10px] uppercase tracking-wider text-[#515f74] shrink-0">
      <div className="flex items-center gap-6">
        <span>Ln 1, Col 1</span>
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
  body?: ReactNode
}

export function NotebookShell({
  breadcrumb,
  accountTitle,
  accountPath,
  balance,
  cards,
  txnCount,
  unsaved = false,
  body,
}: NotebookShellProps) {
  return (
    <div className="w-full h-screen flex bg-[#f7f9fb] font-sans text-[#191c1e] overflow-hidden">
      <NavRail />

      <main className="flex-1 flex flex-col min-w-0">
        <div className="h-12 bg-white border-b border-slate-100 px-6 flex items-center justify-between shrink-0">
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
              disabled={!unsaved}
            >
              <span>Save ⌘S</span>
            </button>
          </div>
        </div>

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

        <StatusBar txnCount={txnCount} />
      </main>

      <AiPane />
    </div>
  )
}
