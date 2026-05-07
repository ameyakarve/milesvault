'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Text, Tooltip } from '@mantine/core'
import type { EventRow } from '../overview-view'
import { DashCard } from './cards'
import { CURRENCY_SYMBOL, compactAmount } from './format'

type Props = {
  rows: EventRow[]
  currency: string
  title?: string
  emptyText?: string
  // When set, rendered above the list (e.g. CC dashboard's 30-day sparkline).
  headerSlot?: ReactNode
  // Toggle the +/− prefix on compacted amounts. CC charges read better
  // unsigned (the column is uniformly outflows); signed flows on bank /
  // income / etc. need the prefix to disambiguate direction.
  signed?: boolean
  // Hide the "View all →" link (e.g. when the route isn't wired).
  showViewAll?: boolean
}

export function RecentTransactionsCard({
  rows,
  currency,
  title = 'Recent transactions',
  emptyText = 'No transactions in this period',
  headerSlot,
  signed = true,
  showViewAll = true,
}: Props) {
  const pathname = usePathname()
  const basePath = pathname.endsWith('/transactions')
    ? pathname.slice(0, -'/transactions'.length)
    : pathname
  const viewAllHref = `${basePath}/transactions`
  const headerRight =
    showViewAll && rows.length > 0 ? (
      <Link
        href={viewAllHref}
        scroll={false}
        className="text-[11px] font-medium text-[#00685f] hover:text-[#004d47] hover:underline"
      >
        View all →
      </Link>
    ) : undefined
  return (
    <DashCard title={title} right={headerRight}>
      {headerSlot}
      {rows.length === 0 ? (
        <Text size="xs" c="dimmed" py="xs">
          {emptyText}
        </Text>
      ) : (
        <div>
          {rows.map((row, i) => {
            const display = formatDisplay(row, currency, signed)
            return (
              <div
                key={i}
                className={`h-[44px] flex items-center px-2 text-[12px] gap-3 ${
                  i === 0 ? 'bg-slate-50/70 rounded' : ''
                } ${i < rows.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <div className="w-[80px] shrink-0 font-mono text-[11px] text-slate-500">
                  {row.date}
                </div>
                <div
                  className={`shrink-0 truncate min-w-0 max-w-[160px] ${
                    i === 0 ? 'font-semibold text-slate-900' : 'font-medium text-slate-900'
                  }`}
                >
                  {row.payee}
                </div>
                <div className="flex-1 text-slate-600 truncate min-w-0">{row.narration}</div>
                <Tooltip label={row.amount} withArrow openDelay={300}>
                  <div
                    className={`shrink-0 text-right font-mono tabular-nums ${row.amountClass}`}
                  >
                    {display}
                  </div>
                </Tooltip>
              </div>
            )
          })}
        </div>
      )}
    </DashCard>
  )
}

function formatDisplay(row: EventRow, currency: string, signed: boolean): string {
  if (row.amountValue == null) {
    // Pre-formatted amount string. Strip a leading + so the column reads
    // cleanly when callers don't want positive signs.
    return signed ? row.amount : row.amount.startsWith('+') ? row.amount.slice(1) : row.amount
  }
  const symbol = CURRENCY_SYMBOL[currency] ?? ''
  const compact = compactAmount(Math.abs(row.amountValue), currency)
  if (!signed) return `${symbol}${compact}`
  const prefix = row.amountValue < 0 ? '−' : row.amountValue > 0 ? '+' : ''
  return `${prefix}${symbol}${compact}`
}
