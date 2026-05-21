'use client'

import type { ExtractStatementRowsProps } from '@/durable/agent-ui-schemas'

export function StatementRows({ input }: { input: ExtractStatementRowsProps }) {
  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: input.currency || 'USD',
    maximumFractionDigits: 2,
    signDisplay: 'auto',
  })
  const balFmt = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: input.currency || 'USD',
    maximumFractionDigits: 2,
  })

  const hasBalance = input.rows.some((r) => typeof r.balance === 'number')
  const hasType = input.rows.some((r) => r.type && r.type.length > 0)

  const inflowCount = input.rows.filter((r) => r.amount > 0).length
  const outflowCount = input.rows.filter((r) => r.amount < 0).length
  const total = input.rows.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        {input.account_hint && (
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            {input.account_hint}
          </div>
        )}
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-slate-900">
            {input.source_filename || 'Statement preview'}
          </span>
          {input.statement_period && (
            <span className="text-xs text-slate-400">
              {input.statement_period}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          <span>{input.rows.length} rows</span>
          <span>{inflowCount} in</span>
          <span>{outflowCount} out</span>
          <span className="tabular-nums">net {fmt.format(total)}</span>
        </div>
      </div>

      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Description</th>
              {hasType && (
                <th className="px-4 py-2 text-left font-medium">Type</th>
              )}
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              {hasBalance && (
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {input.rows.map((r, i) => {
              const positive = r.amount >= 0
              return (
                <tr key={i} className="text-slate-700">
                  <td className="whitespace-nowrap px-4 py-1.5 tabular-nums text-slate-500">
                    {r.date}
                  </td>
                  <td className="px-4 py-1.5">
                    <span className="line-clamp-2 text-slate-900">
                      {r.description}
                    </span>
                  </td>
                  {hasType && (
                    <td className="whitespace-nowrap px-4 py-1.5 text-slate-500">
                      {r.type ?? ''}
                    </td>
                  )}
                  <td
                    className={`whitespace-nowrap px-4 py-1.5 text-right tabular-nums ${
                      positive ? 'text-teal-600' : 'text-slate-700'
                    }`}
                  >
                    {fmt.format(r.amount)}
                  </td>
                  {hasBalance && (
                    <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-slate-500">
                      {typeof r.balance === 'number'
                        ? balFmt.format(r.balance)
                        : ''}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
        Preview only — nothing is committed yet. Confirm the rows, then I'll
        match them against the existing ledger.
      </div>
    </div>
  )
}
