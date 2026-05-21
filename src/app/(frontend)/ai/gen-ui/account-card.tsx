'use client'

import type { AccountCardProps } from '@/durable/agent-ui-schemas'

export function AccountCard({ input }: { input: AccountCardProps }) {
  const balanceFormatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: input.currency || 'USD',
    maximumFractionDigits: 2,
  })
  const txnFormatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: input.currency || 'USD',
    maximumFractionDigits: 2,
    signDisplay: 'auto',
  })

  const segments = input.account.split(':')
  const leaf = segments[segments.length - 1]
  const parent = segments.slice(0, -1).join(' › ')

  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        {parent && (
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            {parent}
          </div>
        )}
        <div className="mt-0.5 text-sm font-semibold text-slate-900">
          {leaf}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-slate-900">
            {balanceFormatter.format(input.balance)}
          </span>
          {input.as_of_date && (
            <span className="text-xs text-slate-400">
              as of {input.as_of_date}
            </span>
          )}
        </div>
      </div>

      {input.recent_txns && input.recent_txns.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {input.recent_txns.map((t, i) => {
            const positive = t.amount >= 0
            const label = t.payee || t.narration || t.counterparty || '—'
            const sub = t.payee && t.narration ? t.narration : t.counterparty
            return (
              <li
                key={i}
                className="flex items-center gap-3 px-4 py-2 text-xs"
              >
                <span className="w-20 shrink-0 tabular-nums text-slate-400">
                  {t.date}
                </span>
                <span className="flex-1 truncate">
                  <span className="text-slate-900">{label}</span>
                  {sub && (
                    <span className="ml-1 truncate text-slate-400">{sub}</span>
                  )}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${
                    positive ? 'text-teal-600' : 'text-slate-700'
                  }`}
                >
                  {txnFormatter.format(t.amount)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
