'use client'

import { Modal } from '@mantine/core'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { EventRow } from './overview-view'
import { CURRENCY_SYMBOL, compactAmount } from './dashboards/format'

const TRANSACTIONS_SUFFIX = '/transactions'

export function TransactionsModal({
  rows,
  currency,
}: {
  rows: EventRow[]
  currency: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const opened = pathname.endsWith(TRANSACTIONS_SUFFIX)

  // Close: navigate back to the parent path. We reach the modal in two ways
  // (card click and direct URL); pushing the parent works for both — the
  // intercepted-click case unmounts the modal, the direct case navigates
  // to the underlying overview page.
  const onClose = () => {
    const parent = pathname.endsWith(TRANSACTIONS_SUFFIX)
      ? pathname.slice(0, -TRANSACTIONS_SUFFIX.length)
      : pathname
    const qs = searchParams.toString()
    router.push(qs ? `${parent}?${qs}` : parent)
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="All transactions"
      size="lg"
      centered
      overlayProps={{ blur: 2 }}
      transitionProps={{ transition: 'fade', duration: 150 }}
    >
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-500">
          No transactions in this period.
        </div>
      ) : (
        <div>
          {rows.map((row, i) => {
            const display =
              row.amountValue != null
                ? `${row.amountValue < 0 ? '−' : '+'}${
                    CURRENCY_SYMBOL[currency] ?? ''
                  }${compactAmount(Math.abs(row.amountValue), currency)}`
                : row.amount
            return (
              <div
                key={i}
                className={`h-[44px] flex items-center px-2 text-[12px] gap-3 ${
                  i < rows.length - 1 ? 'border-b border-slate-100' : ''
                }`}
              >
                <div className="w-[80px] shrink-0 font-mono text-[11px] text-slate-500">
                  {row.date}
                </div>
                <div className="shrink-0 truncate min-w-0 max-w-[160px] font-medium text-slate-900">
                  {row.payee}
                </div>
                <div className="flex-1 text-slate-600 truncate min-w-0">
                  {row.narration}
                </div>
                <div
                  className={`shrink-0 text-right font-mono tabular-nums ${row.amountClass}`}
                  title={row.amount}
                >
                  {display}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
