'use client'

import React, { useEffect, useState } from 'react'
import type { AccountSummaryRow } from '@/durable/ledger-types'
import { AccountsDirectory, type AccountRow } from './accounts-directory'

function dateFromInt(n: number): string {
  const s = String(n).padStart(8, '0')
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

function balanceFromScaled(balanceScaled: string, scale: number): number {
  const negative = balanceScaled.startsWith('-')
  const raw = negative ? balanceScaled.slice(1) : balanceScaled
  const padded = raw.padStart(scale + 1, '0')
  const intPart = padded.slice(0, padded.length - scale) || '0'
  const fracPart = padded.slice(padded.length - scale)
  const numeric = Number(`${intPart}.${fracPart}`)
  return negative ? -numeric : numeric
}

function rowsFromSummaries(rows: AccountSummaryRow[]): AccountRow[] {
  return rows.map((r) => ({
    path: r.account,
    currency: r.currency,
    balance: balanceFromScaled(r.balance_scaled, r.scale),
    lastActivity: r.last_activity ? dateFromInt(r.last_activity) : null,
  }))
}

export function AccountsDirectoryLoader({ initialAsOf }: { initialAsOf: string }) {
  const [rows, setRows] = useState<AccountRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/ledger/accounts?as_of=${encodeURIComponent(initialAsOf)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`accounts: ${r.status}`)
        return r.json() as Promise<{ rows: AccountSummaryRow[] }>
      })
      .then((data) => {
        if (cancelled) return
        setRows(rowsFromSummaries(data.rows))
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [initialAsOf])

  if (error) {
    return (
      <div className="p-8 font-mono text-sm text-rose-600">
        Failed to load accounts: {error}
      </div>
    )
  }
  return <AccountsDirectory rows={rows ?? []} />
}
