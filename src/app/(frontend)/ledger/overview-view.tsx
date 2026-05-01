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
  trend: { title: string; subtitle: string; points: TrendPoint[]; yLabels: string[]; highlightIndex?: number }
  composition: { title: string; subtitle: string; rows: CompositionRow[]; moreCount?: number }
  events: { title: string; subtitle: string; rows: EventRow[] }
}

const RANGES: OverviewViewProps['range'][] = ['1M', '3M', 'YTD', '12M', 'All']

function CardShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-100 rounded-md p-4 ${className}`}>
      {children}
    </div>
  )
}

function CardTitleRow({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
      <span className="font-mono text-[11px] text-slate-500">{subtitle}</span>
    </div>
  )
}

function KpiTile({ kpi }: { kpi: OverviewKpi }) {
  return (
    <CardShell className="flex-1">
      <div className="text-[11px] uppercase tracking-wider font-mono text-slate-500 mb-2">
        {kpi.label}
      </div>
      <div className={`font-mono text-[24px] leading-tight font-bold ${kpi.valueClass ?? 'text-slate-900'}`}>
        {kpi.value}
      </div>
      <div className="mt-2 flex items-center gap-2 min-h-[18px]">
        {kpi.caption && <span className="text-[11px] text-slate-500">{kpi.caption}</span>}
        {kpi.chip && (
          <span
            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm ${
              kpi.chip.tone === 'pos' ? 'bg-[#00685f] text-white' : 'bg-rose-600 text-white'
            }`}
          >
            {kpi.chip.text}
          </span>
        )}
      </div>
    </CardShell>
  )
}

function TrendChart({
  title,
  subtitle,
  points,
  yLabels,
  highlightIndex,
}: OverviewViewProps['trend']) {
  const [hover, setHover] = useState<number | null>(highlightIndex ?? null)
  const W = 720
  const H = 220
  const padL = 36
  const padR = 12
  const padT = 10
  const padB = 22
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const ys = points.map((p) => p.y)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const yRange = yMax - yMin || 1
  const yPadded = yRange * 0.12
  const yLo = yMin - yPadded
  const yHi = yMax + yPadded
  const xAt = (i: number) => padL + (innerW * i) / Math.max(points.length - 1, 1)
  const yAt = (v: number) => padT + innerH - ((v - yLo) / (yHi - yLo)) * innerH
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.y)}`).join(' ')
  const gridYs = yLabels.map((_, i) => padT + (innerH * i) / (yLabels.length - 1))
  const xTickEvery = Math.max(1, Math.ceil(points.length / 6))
  const active = hover ?? -1
  const tooltip =
    active >= 0 && active < points.length
      ? { p: points[active]!, x: xAt(active), y: yAt(points[active]!.y) }
      : null
  return (
    <CardShell className="flex-1">
      <CardTitleRow title={title} subtitle={subtitle} />
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          className="block"
          onMouseLeave={() => setHover(highlightIndex ?? null)}
        >
          {gridYs.map((gy, i) => (
            <line
              key={`g-${i}`}
              x1={padL}
              x2={W - padR}
              y1={gy}
              y2={gy}
              stroke="#e2e8f0"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
          ))}
          {yLabels.map((lbl, i) => (
            <text
              key={`yl-${i}`}
              x={padL - 6}
              y={gridYs[gridYs.length - 1 - i]! + 3}
              textAnchor="end"
              className="fill-slate-500"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}
            >
              {lbl}
            </text>
          ))}
          {points.map((p, i) =>
            i % xTickEvery === 0 ? (
              <text
                key={`xl-${i}`}
                x={xAt(i)}
                y={H - 6}
                textAnchor="middle"
                className="fill-slate-500"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}
              >
                {p.x}
              </text>
            ) : null,
          )}
          <path d={path} stroke="#00685f" strokeWidth="2" fill="none" strokeLinejoin="round" />
          {tooltip && (
            <line
              x1={tooltip.x}
              x2={tooltip.x}
              y1={padT}
              y2={padT + innerH}
              stroke="#00685f"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity={0.6}
            />
          )}
          {points.map((p, i) => (
            <circle
              key={`pt-${i}`}
              cx={xAt(i)}
              cy={yAt(p.y)}
              r={10}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              style={{ cursor: 'pointer' }}
            />
          ))}
          {tooltip && <circle cx={tooltip.x} cy={tooltip.y} r="3" fill="#00685f" />}
        </svg>
        {tooltip && (
          <div
            className="absolute pointer-events-none px-2 py-1 bg-white border border-slate-200 rounded-sm shadow-sm font-mono text-[11px] text-slate-900"
            style={{
              left: `calc(${(tooltip.x / W) * 100}% + 6px)`,
              top: `calc(${(tooltip.y / H) * 100}% - 28px)`,
              transform: tooltip.x > W * 0.7 ? 'translateX(-100%) translateX(-12px)' : undefined,
              whiteSpace: 'nowrap',
            }}
          >
            {tooltip.p.label}
          </div>
        )}
      </div>
    </CardShell>
  )
}

function CompositionList({ title, subtitle, rows, moreCount }: OverviewViewProps['composition']) {
  return (
    <CardShell className="w-[360px] shrink-0">
      <CardTitleRow title={title} subtitle={subtitle} />
      <div className="flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <div key={i} className="relative h-[24px] flex items-center px-2">
            <div
              className="absolute left-0 top-0 bottom-0 rounded-sm"
              style={{ width: `${Math.max(2, Math.round(row.scale * 100))}%`, backgroundColor: 'rgba(0,104,95,0.10)' }}
            />
            <div className="relative flex-1 font-mono text-[12px] truncate">
              <span className="text-slate-400">{row.prefix}</span>
              <span className="text-slate-900 font-bold">{row.leaf}</span>
            </div>
            <div className={`relative font-mono text-[12px] tabular-nums pl-3 ${row.amountClass}`}>
              {row.amount}
            </div>
          </div>
        ))}
        {moreCount != null && moreCount > 0 && (
          <div className="text-[11px] text-slate-500 mt-1 pl-2">+{moreCount} more →</div>
        )}
      </div>
    </CardShell>
  )
}

function EventsList({ title, subtitle, rows }: OverviewViewProps['events']) {
  return (
    <CardShell>
      <CardTitleRow title={title} subtitle={subtitle} />
      <div className="flex flex-col">
        {rows.map((row, i) => (
          <div
            key={i}
            className="h-[40px] flex items-center border-t border-slate-100 first:border-t-0 last:border-b last:border-b-slate-100"
          >
            <div className="w-[100px] font-mono text-[12px] text-slate-500">{row.date}</div>
            <div className="w-[140px] text-[12px] text-slate-900">{row.payee}</div>
            <div className="flex-1 text-[12px] text-slate-600 truncate">{row.narration}</div>
            <div className={`w-[130px] font-mono text-[12px] tabular-nums text-right ${row.amountClass}`}>
              {row.amount}
            </div>
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
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-slate-500">{caption}</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setActiveRange(r)}
                className={`px-2 py-0.5 text-[11px] font-mono rounded-sm transition-colors ${
                  activeRange === r
                    ? 'bg-[#00685f] text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
            <input type="checkbox" className="h-3 w-3 accent-[#00685f]" defaultChecked={false} />
            <span>Δ vs prior period</span>
          </label>
        </div>
      </div>

      <div className="flex gap-4">
        {kpis.map((k, i) => (
          <KpiTile key={i} kpi={k} />
        ))}
      </div>

      <div className="flex gap-4">
        <TrendChart {...trend} />
        <CompositionList {...composition} />
      </div>

      <EventsList {...events} />
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
    subtitle: '12 months · monthly close',
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
    subtitle: '12 months · by absolute flow',
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
    subtitle: 'outliers, large flows, recurring credits',
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
