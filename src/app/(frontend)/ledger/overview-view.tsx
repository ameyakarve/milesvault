'use client'

import React, { useState } from 'react'

export type OverviewKpi = {
  label: string
  value: string
  valueClass?: string
  caption?: string
  chip?: { text: string; tone: 'pos' | 'neg' }
}

export type TrendPoint = { x: string; y: number; label: string }

export type CompositionRow = {
  prefix: string
  leaf: string
  amount: string
  amountClass: string
  scale: number
}

export type EventRow = {
  date: string
  payee: string
  narration: string
  amount: string
  amountClass: string
}

export type OverviewViewProps = {
  caption: string
  range: '1M' | '3M' | 'YTD' | '12M' | 'All'
  kpis: OverviewKpi[]
  trend: { title: string; points: TrendPoint[]; yLabels: string[]; highlightIndex?: number }
  composition: { title: string; rows: CompositionRow[]; moreCount?: number }
  events: { title: string; rows: EventRow[] }
}

const RANGES: OverviewViewProps['range'][] = ['1M', '3M', 'YTD', '12M', 'All']

function CardShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-100 rounded-md p-4 ${className}`}>
      {children}
    </div>
  )
}

function CardTitleRow({ title }: { title: string }) {
  return <h3 className="text-[13px] font-semibold text-slate-900 mb-4">{title}</h3>
}

function KpiTile({ kpi }: { kpi: OverviewKpi }) {
  return (
    <CardShell>
      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">
        {kpi.label}
      </div>
      <div className="flex items-baseline space-x-2">
        <span className={`font-mono text-xl font-bold ${kpi.valueClass ?? 'text-slate-900'}`}>
          {kpi.value}
        </span>
        {kpi.chip && (
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
              kpi.chip.tone === 'pos'
                ? 'bg-[#00685f]/10 text-[#00685f]'
                : 'bg-rose-600/10 text-rose-600'
            }`}
          >
            {kpi.chip.text}
          </span>
        )}
      </div>
      {kpi.caption && (
        <div className="text-[10px] text-slate-400 mt-1 italic">{kpi.caption}</div>
      )}
    </CardShell>
  )
}

function TrendChart({
  title,
  points,
  yLabels,
  highlightIndex,
}: OverviewViewProps['trend']) {
  const [hover, setHover] = useState<number | null>(highlightIndex ?? null)
  const ys = points.map((p) => p.y)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const yRange = yMax - yMin || 1
  const yPadded = yRange * 0.12
  const yLo = yMin - yPadded
  const yHi = yMax + yPadded
  const xAt = (i: number) => (100 * i) / Math.max(points.length - 1, 1)
  const yAt = (v: number) => 100 - ((v - yLo) / (yHi - yLo)) * 100
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(p.y)}`).join(' ')
  const xLabels = ['May 25', 'Jul', 'Sep', 'Nov', 'Jan 26', 'Mar']
  const yLabelsReversed = [...yLabels].reverse()
  const active = hover ?? -1
  const tooltip =
    active >= 0 && active < points.length
      ? { p: points[active]!, x: xAt(active), y: yAt(points[active]!.y) }
      : null
  return (
    <div className="w-[60%] bg-white border border-slate-100 rounded-md p-4 flex flex-col">
      <div className="text-[13px] font-semibold text-slate-900 mb-6">{title}</div>
      <div className="flex-1 relative h-48">
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          {yLabels.map((_, i) => (
            <div key={i} className="border-t border-dotted border-slate-100 w-full" />
          ))}
        </div>
        <div className="absolute inset-0 right-[5%] border-l border-b border-slate-100">
          <svg
            className="h-full w-full overflow-visible"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
            onMouseLeave={() => setHover(highlightIndex ?? null)}
          >
            <path d={pathD} fill="none" stroke="#00685f" strokeWidth={2} />
            {tooltip && (
              <line
                stroke="#00685f"
                strokeDasharray="2,2"
                strokeWidth={1}
                x1={tooltip.x}
                x2={tooltip.x}
                y1={0}
                y2={100}
              />
            )}
            {points.map((_, i) => (
              <circle
                key={i}
                cx={xAt(i)}
                cy={yAt(points[i]!.y)}
                r={3}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </svg>
          {tooltip && (
            <div
              className="absolute right-0 top-0 translate-x-1/2 -translate-y-full mb-2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-20"
              style={{ left: `${tooltip.x}%`, right: 'auto' }}
            >
              {tooltip.p.label}
            </div>
          )}
        </div>
        <div className="absolute left-1 inset-y-0 flex flex-col justify-between text-[10px] font-mono text-slate-500">
          {yLabelsReversed.map((lbl, i) => (
            <span key={i}>{lbl}</span>
          ))}
        </div>
        <div className="absolute -bottom-6 left-0 right-[5%] flex justify-between text-[10px] font-mono text-slate-500">
          {xLabels.map((lbl, i) => (
            <span key={i}>{lbl}</span>
          ))}
        </div>
      </div>
      <div className="mt-8" />
    </div>
  )
}

function CompositionList({ title, rows, moreCount }: OverviewViewProps['composition']) {
  return (
    <CardShell className="w-[40%] shrink-0 flex flex-col">
      <CardTitleRow title={title} />
      <div className="flex-1 flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="relative flex items-center justify-between text-[11px] py-1 px-2 rounded overflow-hidden">
            <div
              className="absolute inset-0 z-0"
              style={{ width: `${Math.max(2, Math.round(row.scale * 100))}%`, backgroundColor: 'rgba(0,104,95,0.08)' }}
            />
            <span className="relative z-10 truncate pr-4 text-slate-700">
              {row.prefix}
              {row.leaf}
            </span>
            <span
              className={`relative z-10 font-mono ${
                row.amountClass.includes('rose') ? row.amountClass : `${row.amountClass} font-bold`
              }`}
            >
              {row.amount}
            </span>
          </div>
        ))}
        {moreCount != null && moreCount > 0 && (
          <div className="mt-3 text-[11px] italic text-slate-400 text-right">+{moreCount} more →</div>
        )}
      </div>
    </CardShell>
  )
}

function EventsList({ title, rows }: OverviewViewProps['events']) {
  return (
    <CardShell>
      <CardTitleRow title={title} />
      <div>
        {rows.map((row, i) => (
          <div
            key={i}
            className={`h-[40px] flex items-center border-b border-slate-100 text-[12px] ${
              i === 0 ? 'border-t' : ''
            }`}
          >
            <div className="w-[100px] font-mono text-slate-500">{row.date}</div>
            <div className="w-[140px] font-medium text-slate-900 truncate">{row.payee}</div>
            <div className="flex-1 text-slate-600 truncate">{row.narration}</div>
            <div className={`w-[130px] text-right font-mono ${row.amountClass}`}>{row.amount}</div>
          </div>
        ))}
      </div>
    </CardShell>
  )
}

export function OverviewView({
  caption,
  range,
  kpis,
  trend,
  composition,
  events,
}: OverviewViewProps) {
  const [activeRange, setActiveRange] = useState<OverviewViewProps['range']>(range)
  return (
    <div data-overview-root className="flex-1 flex flex-col bg-white overflow-y-auto">
      <div className="px-6 py-2 flex items-center justify-between border-b border-slate-100 flex-shrink-0 bg-white sticky top-0 z-10">
        <div className="text-[11px] text-slate-500 font-medium">{caption}</div>
        <div className="flex items-center space-x-4">
          <div className="flex bg-slate-100 p-0.5 rounded-full">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setActiveRange(r)}
                className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                  activeRange === r ? 'bg-[#00685f] text-white' : 'text-slate-500'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex items-center space-x-1.5 opacity-60">
            <div className="w-6 h-3 bg-slate-200 rounded-full relative">
              <div className="absolute left-0.5 top-0.5 w-2 h-2 bg-white rounded-full" />
            </div>
            <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">
              Δ vs prior period
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-6">
          {kpis.map((k, i) => (
            <KpiTile key={i} kpi={k} />
          ))}
        </div>

        <div className="flex space-x-6">
          <TrendChart {...trend} />
          <CompositionList {...composition} />
        </div>

        <EventsList {...events} />
      </div>
    </div>
  )
}

export const BANK_OVERVIEW_SAMPLE: OverviewViewProps = {
  caption: 'Overview · 12 months',
  range: '12M',
  kpis: [
    {
      label: 'Balance',
      value: '₹4,82,550.00',
      caption: 'as of today',
    },
    {
      label: 'Net change · 12M',
      value: '+₹1,12,440.00',
      valueClass: 'text-[#00685f]',
      chip: { text: '+18.2% vs prior 12M', tone: 'pos' },
    },
    {
      label: 'Avg monthly net',
      value: '+₹9,370.00',
      caption: 'last 12 months',
    },
  ],
  trend: {
    title: 'Balance over time',
    yLabels: ['1L', '2L', '3L', '4L', '5L'],
    highlightIndex: 10,
    points: [
      { x: 'May 25', y: 370110, label: 'May 25 · ₹3,70,110.00' },
      { x: 'Jun', y: 382330, label: 'Jun 25 · ₹3,82,330.00' },
      { x: 'Jul', y: 395500, label: 'Jul 25 · ₹3,95,500.00' },
      { x: 'Aug', y: 402200, label: 'Aug 25 · ₹4,02,200.00' },
      { x: 'Sep', y: 418000, label: 'Sep 25 · ₹4,18,000.00' },
      { x: 'Oct', y: 425500, label: 'Oct 25 · ₹4,25,500.00' },
      { x: 'Nov', y: 438000, label: 'Nov 25 · ₹4,38,000.00' },
      { x: 'Dec', y: 442300, label: 'Dec 25 · ₹4,42,300.00' },
      { x: 'Jan 26', y: 458000, label: 'Jan 26 · ₹4,58,000.00' },
      { x: 'Feb', y: 468200, label: 'Feb 26 · ₹4,68,200.00' },
      { x: 'Mar', y: 475320, label: 'Mar 26 · ₹4,75,320.00' },
      { x: 'Apr', y: 482550, label: 'Apr 26 · ₹4,82,550.00' },
    ],
  },
  composition: {
    title: 'Top counter-accounts',
    moreCount: 12,
    rows: [
      {
        prefix: 'Income:Salary:',
        leaf: 'Employer',
        amount: '+₹6,00,000.00',
        amountClass: 'text-slate-900',
        scale: 1.0,
      },
      {
        prefix: 'Liabilities:CC:HDFC:',
        leaf: 'Infinia',
        amount: '−₹2,40,000.00',
        amountClass: 'text-rose-600',
        scale: 0.4,
      },
      {
        prefix: 'Expenses:',
        leaf: 'Housing',
        amount: '−₹1,80,000.00',
        amountClass: 'text-rose-600',
        scale: 0.3,
      },
      {
        prefix: 'Assets:Loaded:Wallets:',
        leaf: 'Paytm',
        amount: '−₹52,400.00',
        amountClass: 'text-rose-600',
        scale: 0.09,
      },
      {
        prefix: 'Assets:Investments:Zerodha:',
        leaf: 'Stocks',
        amount: '−₹40,000.00',
        amountClass: 'text-rose-600',
        scale: 0.07,
      },
      {
        prefix: 'Expenses:',
        leaf: 'Travel',
        amount: '−₹28,500.00',
        amountClass: 'text-rose-600',
        scale: 0.05,
      },
    ],
  },
  events: {
    title: 'Notable events',
    rows: [
      {
        date: '2026-04-30',
        payee: 'Employer',
        narration: 'April salary',
        amount: '+₹50,000.00',
        amountClass: 'text-slate-900',
      },
      {
        date: '2026-04-25',
        payee: 'HDFC Infinia',
        narration: 'Card autopay',
        amount: '−₹38,420.00',
        amountClass: 'text-rose-600',
      },
      {
        date: '2026-04-20',
        payee: 'Landlord',
        narration: 'April rent',
        amount: '−₹15,000.00',
        amountClass: 'text-rose-600',
      },
      {
        date: '2026-03-31',
        payee: 'Employer',
        narration: 'March salary',
        amount: '+₹50,000.00',
        amountClass: 'text-slate-900',
      },
      {
        date: '2026-03-15',
        payee: 'IRCTC',
        narration: 'Goa flights',
        amount: '−₹22,800.00',
        amountClass: 'text-rose-600',
      },
    ],
  },
}
