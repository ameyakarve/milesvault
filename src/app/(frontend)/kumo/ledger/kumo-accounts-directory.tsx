'use client'

import Link from 'next/link'
import React, { useEffect, useMemo, useState } from 'react'
import type { AccountSummaryRow } from '@/durable/ledger-types'
import { Button } from '@cloudflare/kumo/components/button'
import { InputGroup } from '@cloudflare/kumo/components/input-group'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/ssr'

type AccountKind = 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses'

type AccountRow = {
  path: string
  currency: string
  balance: number
  lastActivity: string | null
}

const CHIPS: ('All' | AccountKind)[] = [
  'All',
  'Assets',
  'Liabilities',
  'Equity',
  'Income',
  'Expenses',
]

const CURRENCY_FORMAT: Record<string, { locale: string; min: number; max: number }> = {
  INR: { locale: 'en-IN', min: 2, max: 2 },
  USD: { locale: 'en-US', min: 2, max: 2 },
  EUR: { locale: 'de-DE', min: 2, max: 2 },
  GBP: { locale: 'en-GB', min: 2, max: 2 },
  CNY: { locale: 'en-US', min: 2, max: 2 },
  AVIOS: { locale: 'en-US', min: 0, max: 0 },
  BTC: { locale: 'en-US', min: 8, max: 8 },
}

function formatBalance(amount: number, currency: string): string {
  const meta = CURRENCY_FORMAT[currency] ?? { locale: 'en-US', min: 2, max: 2 }
  const grouped = new Intl.NumberFormat(meta.locale, {
    minimumFractionDigits: meta.min,
    maximumFractionDigits: meta.max,
  }).format(Math.abs(amount))
  if (amount === 0) return grouped
  return amount > 0 ? `+${grouped}` : `−${grouped}`
}

function classifyKind(path: string): AccountKind | null {
  const head = path.split(':')[0]
  if (
    head === 'Assets' ||
    head === 'Liabilities' ||
    head === 'Equity' ||
    head === 'Income' ||
    head === 'Expenses'
  ) {
    return head
  }
  return null
}

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

function isHidden(path: string): boolean {
  return path === 'Equity:Void' || path.startsWith('Equity:Void:')
}

function AccountPath({ path }: { path: string }) {
  const segs = path.split(':')
  const leaf = segs.pop() ?? ''
  return (
    <>
      {segs.length > 0 && (
        <span className="text-kumo-subtle">
          {segs.map((s, i) => (
            <React.Fragment key={i}>
              {s}
              <span>:</span>
            </React.Fragment>
          ))}
        </span>
      )}
      <span className="font-semibold text-kumo-default">{leaf}</span>
    </>
  )
}

export function KumoAccountsDirectory({ initialAsOf }: { initialAsOf: string }) {
  const [rows, setRows] = useState<AccountRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chip, setChip] = useState<'All' | AccountKind>('All')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/ledger/accounts?as_of=${encodeURIComponent(initialAsOf)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`accounts: ${r.status}`)
        return r.json() as Promise<{ rows: AccountSummaryRow[] }>
      })
      .then((data) => {
        if (cancelled) return
        setRows(
          data.rows.map((r) => ({
            path: r.account,
            currency: r.currency,
            balance: balanceFromScaled(r.balance_scaled, r.scale),
            lastActivity: r.last_activity ? dateFromInt(r.last_activity) : null,
          })),
        )
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [initialAsOf])

  const visible = useMemo(() => (rows ?? []).filter((r) => !isHidden(r.path)), [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return visible
      .filter((r) => {
        if (chip !== 'All' && classifyKind(r.path) !== chip) return false
        if (q && !r.path.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        const da = a.lastActivity ?? ''
        const db = b.lastActivity ?? ''
        if (da === db) return a.path.localeCompare(b.path)
        return db.localeCompare(da)
      })
  }, [visible, chip, query])

  const totalCount = visible.length

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-kumo-danger">
        Failed to load accounts: {error}
      </div>
    )
  }

  return (
    <main className="flex flex-1 flex-col bg-kumo-base">
      <div className="flex h-8 items-center border-b border-kumo-line px-6">
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-kumo-default">
          Accounts
        </span>
      </div>

      <div className="border-b border-kumo-line px-6 py-6">
        <h1 className="mb-1 text-3xl font-semibold tracking-tight text-kumo-default">
          Accounts
        </h1>
        <p className="text-sm text-kumo-subtle">{totalCount} accounts</p>
      </div>

      <div className="border-b border-kumo-line px-6 py-3">
        <InputGroup className="w-full">
          <InputGroup.Addon>
            <MagnifyingGlass size={16} />
          </InputGroup.Addon>
          <InputGroup.Input
            placeholder="Search accounts…"
            value={query}
            onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
            aria-label="Search accounts"
          />
        </InputGroup>
      </div>

      <div className="flex h-11 items-center gap-2 border-b border-kumo-line bg-kumo-elevated px-6">
        {CHIPS.map((c) => (
          <Button
            key={c}
            type="button"
            variant={chip === c ? 'primary' : 'secondary'}
            size="xs"
            onClick={() => setChip(c)}
          >
            {c}
          </Button>
        ))}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-8 flex-shrink-0 items-center whitespace-nowrap border-b border-kumo-line bg-kumo-base px-6 font-mono text-[10px] font-bold uppercase tracking-widest text-kumo-subtle">
          <div className="flex-1 pr-4">Account</div>
          <div className="ml-4 w-[120px] text-right">Last Activity</div>
          <div className="ml-4 w-[60px] text-right">CCY</div>
          <div className="ml-2 w-[140px] text-right">Balance</div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {rows == null ? (
            <div className="p-6 text-xs text-kumo-subtle">Loading…</div>
          ) : (
            filtered.map((row, idx) => {
              const negative = row.balance < 0
              const href = `/kumo/ledger/${row.path
                .split(':')
                .map(encodeURIComponent)
                .join('/')}?ccy=${encodeURIComponent(row.currency)}`
              return (
                <Link
                  key={`${row.path}|${row.currency}|${idx}`}
                  href={href}
                  className="group flex h-10 items-center border-b border-kumo-line px-6 hover:bg-kumo-tint"
                >
                  <div className="flex-1 truncate pr-4 font-mono text-xs">
                    <AccountPath path={row.path} />
                  </div>
                  <div className="ml-4 w-[120px] text-right font-mono text-xs tabular-nums text-kumo-subtle">
                    {row.lastActivity ?? '—'}
                  </div>
                  <div className="ml-4 w-[60px] text-right font-mono text-[11px] tabular-nums text-kumo-subtle">
                    {row.currency}
                  </div>
                  <div
                    className={`ml-2 w-[140px] text-right font-mono text-[13px] tabular-nums ${
                      negative ? 'text-kumo-danger' : 'text-kumo-default'
                    }`}
                  >
                    {formatBalance(row.balance, row.currency)}
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </main>
  )
}

