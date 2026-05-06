'use client'

import React, { useState } from 'react'
import { LayerCard } from '@cloudflare/kumo/components/layer-card'
import { StatTile } from './stat-tile'

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
  kpis: OverviewKpi[]
  trend: {
    title: string
    currency: string
    points: TrendPoint[]
    highlightIndex?: number
  }
  composition: { title: string; rows: CompositionRow[]; moreCount?: number }
  events: { title: string; rows: EventRow[] }
  // Optional dashboard-specific derivations. Populated by deriveOverview()
  // unconditionally (cheap to compute); dashboards consume only what they
  // need. Currently used by credit-card; may be reused by income/spending.
  monthlyNet?: { points: TrendPoint[]; totalLabel: string; currency: string }
  categoryBreakdown?: { rows: CompositionRow[]; moreCount: number }
  paidFrom?: { rows: CompositionRow[] }
}

function niceNum(range: number, round: boolean): number {
  if (range <= 0) return 1
  const exp = Math.floor(Math.log10(range))
  const f = range / 10 ** exp
  let nf: number
  if (round) {
    if (f < 1.5) nf = 1
    else if (f < 3) nf = 2
    else if (f < 7) nf = 5
    else nf = 10
  } else {
    if (f <= 1) nf = 1
    else if (f <= 2) nf = 2
    else if (f <= 5) nf = 5
    else nf = 10
  }
  return nf * 10 ** exp
}

function niceTicks(min: number, max: number, n = 5): { lo: number; hi: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const v = Number.isFinite(min) ? min : 0
    const m = Math.max(Math.abs(v), 1)
    const lo = v - m
    const hi = v + m
    const step = (hi - lo) / (n - 1)
    const ticks = Array.from({ length: n }, (_, i) => lo + i * step)
    return { lo, hi, ticks }
  }
  const range = niceNum(max - min, false)
  const step = niceNum(range / (n - 1), true)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(v)
  return { lo, hi, ticks }
}

function pickUnit(maxAbs: number, currency: string): { divisor: number; suffix: string } {
  if (currency === 'INR') {
    if (maxAbs >= 1e7) return { divisor: 1e7, suffix: 'Cr' }
    if (maxAbs >= 1e5) return { divisor: 1e5, suffix: 'L' }
    if (maxAbs >= 1e3) return { divisor: 1e3, suffix: 'K' }
    return { divisor: 1, suffix: '' }
  }
  if (maxAbs >= 1e6) return { divisor: 1e6, suffix: 'M' }
  if (maxAbs >= 1e3) return { divisor: 1e3, suffix: 'K' }
  return { divisor: 1, suffix: '' }
}

function formatTickValue(v: number, unit: { divisor: number; suffix: string }): string {
  if (v === 0) return '0'
  const scaled = v / unit.divisor
  const sign = scaled < 0 ? '−' : ''
  const abs = Math.abs(scaled)
  let body: string
  if (unit.suffix === '') body = String(Math.round(abs))
  else if (abs >= 100) body = String(Math.round(abs))
  else if (abs >= 10) body = abs.toFixed(0)
  else body = abs.toFixed(1).replace(/\.0$/, '')
  return `${sign}${body}${unit.suffix}`
}

function CardShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <LayerCard className={`rounded-md p-4 ${className}`}>{children}</LayerCard>
}

function CardTitleRow({ title }: { title: string }) {
  return <h3 className="text-[13px] font-semibold text-slate-900 mb-4">{title}</h3>
}

function TrendChart({
  title,
  currency,
  points,
  highlightIndex,
}: OverviewViewProps['trend']) {
  const [hover, setHover] = useState<number | null>(highlightIndex ?? null)
  const hasData = points.length > 0
  const ys = points.map((p) => p.y)
  const dataMin = hasData ? Math.min(...ys) : 0
  const dataMax = hasData ? Math.max(...ys) : 0
  const enclosedMin = Math.min(dataMin, 0)
  const enclosedMax = Math.max(dataMax, 0)
  const { lo: yLo, hi: yHi, ticks } = niceTicks(enclosedMin, enclosedMax, 5)
  const maxAbs = Math.max(Math.abs(yLo), Math.abs(yHi), 1)
  const unit = pickUnit(maxAbs, currency)
  const yLabels = ticks.map((t) => formatTickValue(t, unit))
  const xAt = (i: number) => (100 * i) / Math.max(points.length - 1, 1)
  const yAt = (v: number) => 100 - ((v - yLo) / (yHi - yLo || 1)) * 100
  const pathD = hasData
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(p.y)}`).join(' ')
    : ''
  const xLabels = (() => {
    if (!hasData) return [] as string[]
    if (points.length <= 6) return points.map((p) => p.x)
    const out: string[] = []
    for (let i = 0; i < 6; i++) {
      const idx = Math.round(((points.length - 1) * i) / 5)
      out.push(points[idx]!.x)
    }
    return out
  })()
  const yLabelsTopDown = [...yLabels].reverse()
  const active = hover ?? -1
  const tooltip =
    hasData && active >= 0 && active < points.length
      ? { p: points[active]!, x: xAt(active), y: yAt(points[active]!.y) }
      : null
  return (
    <LayerCard className="w-[60%] rounded-md p-4 flex flex-col">
      <div className="text-[13px] font-semibold text-slate-900 mb-4">{title}</div>
      <div className="relative h-48">
        <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col justify-between text-[10px] font-mono text-slate-500 pr-1 text-right">
          {yLabelsTopDown.map((lbl, i) => (
            <span key={i} className="leading-none">
              {lbl}
            </span>
          ))}
        </div>
        <div className="absolute inset-y-0 right-0 left-10">
          <div className="absolute inset-0 flex flex-col-reverse justify-between pointer-events-none">
            {ticks.map((_, i) => (
              <div key={i} className="border-t border-dotted border-slate-100 w-full" />
            ))}
          </div>
          <div className="absolute inset-0 border-l border-b border-slate-100">
            {hasData && (
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
            )}
            {tooltip && (
              <div
                className="absolute top-0 -translate-y-full -translate-x-1/2 mb-2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-20"
                style={{ left: `${tooltip.x}%` }}
              >
                {tooltip.p.label}
              </div>
            )}
            {!hasData && (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">
                No data in selected range
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="ml-10 mt-2 flex justify-between text-[10px] font-mono text-slate-500">
        {xLabels.map((lbl, i) => (
          <span key={i}>{lbl}</span>
        ))}
      </div>
    </LayerCard>
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

export function OverviewView({ trend, composition, events }: OverviewViewProps) {
  return (
    <div
      data-overview-root
      className="flex-1 flex flex-col bg-white overflow-y-auto p-6 space-y-6"
    >
      <div className="flex space-x-6">
        <TrendChart {...trend} />
        <CompositionList {...composition} />
      </div>

      <EventsList {...events} />
    </div>
  )
}

export const BANK_OVERVIEW_SAMPLE: OverviewViewProps = {
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
    currency: 'INR',
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
        prefix: 'Liabilities:CreditCards:HDFC:',
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
