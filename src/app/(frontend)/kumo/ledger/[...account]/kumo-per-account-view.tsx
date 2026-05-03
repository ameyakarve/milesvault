'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Tabs } from '@cloudflare/kumo/components/tabs'
import { LayerCard } from '@cloudflare/kumo/components/layer-card'
import { Breadcrumbs } from '@cloudflare/kumo/components/breadcrumbs'
import { ledgerClient } from '@/lib/ledger-client-browser'
import { isStrictParseErr, parseJournalStrict } from '@/lib/beancount/parse-strict'
import { resolveDashboard } from '@/lib/ledger-core/taxonomy'
import { computeCardSpecs } from '@/app/(frontend)/ledger/card-decorations'
import { deriveOverview, type Period } from '@/app/(frontend)/ledger/overview-derive'
import { OverviewView } from '@/app/(frontend)/ledger/overview-view'
import { getDashboardComponent } from '@/app/(frontend)/ledger/dashboards/registry'
import { shortAccountName } from '@/lib/beancount/account-display'

type TabValue = 'overview' | 'statement' | 'editor'

function pickInitialCurrency(currencies: string[], requested: string | null): string {
  if (requested && currencies.includes(requested)) return requested
  return currencies[0] ?? ''
}

export function KumoPerAccountView({
  account,
  initialCurrency,
}: {
  account: string
  initialCurrency: string | null
}) {
  const [tab, setTab] = useState<TabValue>('overview')
  const [text, setText] = useState<string>('')
  const [currency, setCurrency] = useState<string>(initialCurrency ?? '')
  const [currencies, setCurrencies] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('All time')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cur = await ledgerClient.getAccountCurrencies(account)
        if (cancelled) return
        const next = pickInitialCurrency(cur.currencies, initialCurrency)
        setCurrencies(cur.currencies)
        setCurrency(next)
        if (!next) {
          setLoaded(true)
          return
        }
        const slice = await ledgerClient.getJournalForAccount(account, next)
        if (cancelled) return
        setText(slice.text)
        setLoaded(true)
      } catch (e: unknown) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [account, initialCurrency])

  const parsed = useMemo(() => parseJournalStrict(text), [text])

  const cardSpecs = useMemo(() => {
    if (!currency || isStrictParseErr(parsed)) return []
    return computeCardSpecs(
      parsed.transactions,
      parsed.directives,
      parsed.entries,
      account,
      currency,
      { descending: true },
    )
  }, [parsed, account, currency])

  const overviewProps = useMemo(() => {
    if (!currency || isStrictParseErr(parsed)) return null
    return deriveOverview({
      cardSpecs,
      transactions: parsed.transactions,
      entries: parsed.entries,
      account,
      currency,
      period,
      caption: `Overview · ${period}`,
    })
  }, [cardSpecs, parsed, account, currency, period])

  const dashboardSlug = useMemo(() => resolveDashboard(account)?.slug ?? null, [account])
  const Dashboard = dashboardSlug ? getDashboardComponent(dashboardSlug) : null

  const breadcrumb = account.split(':').filter(Boolean)
  const accountTitle = shortAccountName(account)

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-kumo-base">
      <div className="border-b border-kumo-line px-6 py-4">
        <Breadcrumbs size="sm">
          <Breadcrumbs.Link href="/kumo/ledger">Accounts</Breadcrumbs.Link>
          {breadcrumb.slice(0, -1).map((seg, i) => (
            <span key={i} className="contents">
              <Breadcrumbs.Separator />
              <Breadcrumbs.Link
                href={`/kumo/ledger/${breadcrumb.slice(0, i + 1).join('/')}`}
              >
                {seg}
              </Breadcrumbs.Link>
            </span>
          ))}
          {breadcrumb.length > 0 && (
            <>
              <Breadcrumbs.Separator />
              <Breadcrumbs.Current>{breadcrumb[breadcrumb.length - 1]}</Breadcrumbs.Current>
            </>
          )}
        </Breadcrumbs>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-kumo-default">{accountTitle}</h1>
            <p className="font-mono text-xs text-kumo-subtle">{account}</p>
          </div>
          {currencies.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-kumo-subtle">Currency</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-7 rounded-md border border-kumo-line bg-kumo-base px-2 text-xs text-kumo-default focus:outline-none focus:ring-2 focus:ring-kumo-focus"
              >
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-kumo-line bg-kumo-elevated px-6 py-2">
        <Tabs
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'statement', label: 'Statement' },
            { value: 'editor', label: 'Editor' },
          ]}
          value={tab}
          onValueChange={(v) => setTab(v as TabValue)}
        />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 rounded-md border border-kumo-danger bg-kumo-danger-tint px-3 py-2 text-sm text-kumo-danger">
            {error}
          </div>
        )}
        {!loaded ? (
          <div className="text-sm text-kumo-subtle">Loading…</div>
        ) : tab === 'overview' ? (
          !overviewProps ? (
            <div className="text-sm text-kumo-subtle">No data for this account.</div>
          ) : Dashboard ? (
            <LayerCard className="overflow-hidden rounded-lg">
              <Dashboard {...overviewProps} />
            </LayerCard>
          ) : (
            <LayerCard className="overflow-hidden rounded-lg">
              <OverviewView {...overviewProps} />
            </LayerCard>
          )
        ) : tab === 'statement' ? (
          <KumoStatementPanel
            transactions={isStrictParseErr(parsed) ? [] : parsed.transactions}
            account={account}
            currency={currency}
          />
        ) : (
          <LayerCard className="rounded-lg p-4">
            <pre className="overflow-auto whitespace-pre font-mono text-xs leading-6 text-kumo-default">
              {text || '(empty)'}
            </pre>
            <p className="mt-3 text-xs text-kumo-subtle">
              Read-only preview. The full editor (with save/parse) lives at{' '}
              <Link
                href={`/ledger/${account.split(':').map(encodeURIComponent).join('/')}`}
                className="text-kumo-brand hover:underline"
              >
                /ledger/{account.replaceAll(':', '/')}
              </Link>
              .
            </p>
          </LayerCard>
        )}

        {!loaded ? null : (
          <div className="mt-4 text-xs text-kumo-subtle">
            Period: <span className="font-mono">{period}</span>{' '}
            <button
              type="button"
              onClick={() => setPeriod(period === 'All time' ? '12M' : 'All time')}
              className="ml-2 underline hover:text-kumo-default"
            >
              toggle
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

function KumoStatementPanel({
  transactions,
  account,
  currency,
}: {
  transactions: ReturnType<typeof parseJournalStrict> extends infer R
    ? R extends { transactions: infer T }
      ? T
      : never[]
    : never[]
  account: string
  currency: string
}) {
  type Tx = (typeof transactions)[number]
  const rows = useMemo(() => {
    const grouped = (n: number) =>
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(n))
    return (transactions as Tx[]).map((tx: Tx) => {
      let net = 0
      for (const p of tx.postings) {
        if (
          p.account === account ||
          (p.account?.startsWith(account + ':') ?? false)
        ) {
          if (p.currency === currency && p.amount != null) {
            const v = Number(p.amount)
            if (Number.isFinite(v)) net += v
          }
        }
      }
      return {
        date: tx.date,
        payee: tx.payee,
        narration: tx.narration,
        net,
        netLabel: net === 0 ? '' : `${net < 0 ? '−' : '+'}${grouped(net)}`,
      }
    })
  }, [transactions, account, currency])

  if (rows.length === 0) {
    return <div className="text-sm text-kumo-subtle">No transactions in slice.</div>
  }

  return (
    <LayerCard className="overflow-hidden rounded-lg">
      <div className="flex h-8 items-center border-b border-kumo-line bg-kumo-elevated px-4 font-mono text-[10px] font-bold uppercase tracking-widest text-kumo-subtle">
        <div className="w-[100px]">Date</div>
        <div className="w-[160px]">Payee</div>
        <div className="flex-1">Narration</div>
        <div className="w-[140px] text-right">Net ({currency})</div>
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          className="flex h-10 items-center border-b border-kumo-line px-4 font-mono text-xs last:border-b-0"
        >
          <div className="w-[100px] text-kumo-subtle">{r.date}</div>
          <div className="w-[160px] truncate font-semibold text-kumo-default">
            {r.payee || '—'}
          </div>
          <div className="flex-1 truncate text-kumo-default">{r.narration}</div>
          <div
            className={`w-[140px] text-right tabular-nums ${
              r.net < 0 ? 'text-kumo-danger' : 'text-kumo-default'
            }`}
          >
            {r.netLabel}
          </div>
        </div>
      ))}
    </LayerCard>
  )
}
