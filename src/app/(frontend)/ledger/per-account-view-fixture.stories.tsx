import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import React, { useEffect, useRef, useState } from 'react'
import { PerAccountView } from './per-account-view'
import { parseJournal, serializeJournal } from '@/lib/beancount/ast'
import {
  directiveTouchesAccountCurrency,
  txnTouchesAccountCurrency,
} from '@/lib/beancount/scope'

const ACCOUNT = 'Liabilities:CreditCard:HSBC:Cashback'

const FIXTURE = `2025-01-01 open ${ACCOUNT} INR

2025-01-15 * "Coffee"
  ${ACCOUNT}                                       -250.00 INR
  Expenses:Food:Coffee                              250.00 INR

2025-01-20 * "Groceries"
  ${ACCOUNT}                                      -1500.50 INR
  Expenses:Food:Groceries                          1500.50 INR

2025-01-25 * "Refund"
  ${ACCOUNT}                                        500.00 INR
  Expenses:Food:Coffee                             -500.00 INR

2025-01-31 balance ${ACCOUNT}                      -1250.50 INR

2025-02-01 pad ${ACCOUNT} Equity:Opening-Balances

2025-02-15 note ${ACCOUNT} "checked statement"

2025-02-28 close ${ACCOUNT}
`

const PREFIX_ACCOUNT = 'Liabilities:CreditCard:HSBC'
const SUB_CASHBACK = `${PREFIX_ACCOUNT}:Cashback`
const SUB_REWARDS = `${PREFIX_ACCOUNT}:Rewards`
const SIBLING = 'Liabilities:CreditCard:HSBCBank'

const PREFIX_FIXTURE = `2024-12-01 open ${PREFIX_ACCOUNT} INR
2024-12-01 open ${SUB_CASHBACK} INR
2024-12-01 open ${SUB_REWARDS} INR
2024-12-01 open ${SIBLING} INR

2025-01-05 * "Direct charge to HSBC"
  ${PREFIX_ACCOUNT}                                -1000.00 INR
  Expenses:Misc                                     1000.00 INR

2025-01-10 * "Cashback statement credit"
  ${SUB_CASHBACK}                                   -250.00 INR
  Expenses:Food:Coffee                              250.00 INR

2025-01-15 * "Rewards points redemption"
  ${SUB_REWARDS}                                    -500.00 INR
  Expenses:Travel                                   500.00 INR

2025-01-20 * "HSBCBank sibling — MUST NOT appear in :HSBC view"
  ${SIBLING}                                       -9999.00 INR
  Expenses:Misc                                     9999.00 INR
`

// Real-world data: 17 multi-posting txns (4 lines each, 2 of which post to the
// account) + a balance assertion + open. Stresses card-boundary rendering
// because each card spans 5 document lines (date + 4 postings).
const REAL_ACCOUNT = 'Liabilities:CreditCards:HSBC:Cashback:9065'
const REAL_FIXTURE = `2026-04-25 * "RAZ*SWIGGY"
  ${REAL_ACCOUNT}       -2.00 INR
  Expenses:Miscellaneous                            2.00 INR
2026-04-25 * "Refund from Swiggy"
  ${REAL_ACCOUNT}        2.00 INR
  Expenses:Miscellaneous                           -2.00 INR
2026-04-21 * "NEW SHANTHI UPAHAR"
  ${REAL_ACCOUNT}      -50.00 INR
  Expenses:Miscellaneous                           50.00 INR
  ${REAL_ACCOUNT}        5.00 INR
  Equity:Void                                      -5.00 INR
2026-04-19 * "AMBROSIA BRANDS PRIVAT"
  ${REAL_ACCOUNT}     -105.00 INR
  Expenses:Miscellaneous                          105.00 INR
  ${REAL_ACCOUNT}       10.50 INR
  Equity:Void                                     -10.50 INR
2026-04-10 * "AMBROSIA BRANDS PRIVAT"
  ${REAL_ACCOUNT}      -35.00 INR
  Expenses:Miscellaneous                           35.00 INR
  ${REAL_ACCOUNT}        3.50 INR
  Equity:Void                                      -3.50 INR
2026-04-10 * "AGNAY SRUSTHI LOUKYA VE"
  ${REAL_ACCOUNT}      -18.00 INR
  Expenses:Miscellaneous                           18.00 INR
  ${REAL_ACCOUNT}        1.80 INR
  Equity:Void                                      -1.80 INR
2026-04-09 * "AMBROSIA BRANDS PRIVAT"
  ${REAL_ACCOUNT}     -152.00 INR
  Expenses:Miscellaneous                          152.00 INR
  ${REAL_ACCOUNT}       15.20 INR
  Equity:Void                                     -15.20 INR
2026-04-07 * "AMBROSIA BRANDS PRIVAT"
  ${REAL_ACCOUNT}      -35.00 INR
  Expenses:Miscellaneous                           35.00 INR
  ${REAL_ACCOUNT}        3.50 INR
  Equity:Void                                      -3.50 INR
2026-04-06 * "AMBROSIA BRANDS PRIVAT"
  ${REAL_ACCOUNT}      -76.00 INR
  Expenses:Miscellaneous                           76.00 INR
  ${REAL_ACCOUNT}        7.60 INR
  Equity:Void                                      -7.60 INR
2026-04-05 * "AMBROSIA BRANDS PRIVAT"
  ${REAL_ACCOUNT}      -35.00 INR
  Expenses:Miscellaneous                           35.00 INR
  ${REAL_ACCOUNT}        3.50 INR
  Equity:Void                                      -3.50 INR
2026-04-05 * "AGNAY SRUSTHI LOUKYA VE"
  ${REAL_ACCOUNT}      -38.00 INR
  Expenses:Miscellaneous                           38.00 INR
  ${REAL_ACCOUNT}        3.80 INR
  Equity:Void                                      -3.80 INR
2026-04-03 * "AMBROSIA BRANDS PRIVAT"
  ${REAL_ACCOUNT}      -35.00 INR
  Expenses:Miscellaneous                           35.00 INR
  ${REAL_ACCOUNT}        3.50 INR
  Equity:Void                                      -3.50 INR
2026-04-02 * "AMBROSIA BRANDS PRIVAT"
  ${REAL_ACCOUNT}      -35.00 INR
  Expenses:Miscellaneous                           35.00 INR
  ${REAL_ACCOUNT}        3.50 INR
  Equity:Void                                      -3.50 INR
2026-04-02 * "ZOMATO LTD"
  ${REAL_ACCOUNT}    -1558.00 INR
  Expenses:Miscellaneous                         1558.00 INR
  ${REAL_ACCOUNT}      155.80 INR
  Equity:Void                                    -155.80 INR
2026-04-01 * "AMBROSIA BRANDS PRIVAT"
  ${REAL_ACCOUNT}      -76.00 INR
  Expenses:Miscellaneous                           76.00 INR
  ${REAL_ACCOUNT}        7.60 INR
  Equity:Void                                      -7.60 INR
2026-03-31 * "AMBROSIA BRANDS PRIVAT"
  ${REAL_ACCOUNT}      -35.00 INR
  Expenses:Miscellaneous                           35.00 INR
  ${REAL_ACCOUNT}        3.50 INR
  Equity:Void                                      -3.50 INR
2023-01-01 balance ${REAL_ACCOUNT} 0.00 INR
2023-01-01 open ${REAL_ACCOUNT}    INR
`

type AccountKey =
  | typeof ACCOUNT
  | typeof PREFIX_ACCOUNT
  | typeof REAL_ACCOUNT

function sliceFor(text: string, account: string, currency: string): string {
  const parsed = parseJournal(text)
  const txns = parsed.transactions.filter((tx) =>
    txnTouchesAccountCurrency(tx, account, currency),
  )
  const directives = parsed.directives.filter((d) =>
    directiveTouchesAccountCurrency(d, account, currency),
  )
  return serializeJournal(txns, directives)
}

function makeFetchMock(text: string, account: AccountKey) {
  const encoded = encodeURIComponent(account)
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const body = (data: unknown) =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    const isGet = !init || !init.method || init.method === 'GET'
    if (
      isGet &&
      url.includes(`/accounts/${encoded}/journal`)
    ) {
      const u = new URL(url, 'http://localhost')
      const currency = u.searchParams.get('currency')
      const sliced = currency ? sliceFor(text, account, currency) : text
      return body({ text: sliced })
    }
    if (url.endsWith('/journal') && isGet) {
      return body({ text })
    }
    if (url.includes('/currencies')) {
      return body({ currencies: ['INR'] })
    }
    if (url.includes('/recent') && init?.method === 'POST') {
      return body({ ok: true })
    }
    if (url.includes('/recent')) {
      return body({ accounts: [account] })
    }
    if (init?.method === 'PUT') {
      return body({ text, inserted: 0, deleted: 0, unchanged: 0 })
    }
    return body({})
  }
}

function FetchHarness({
  text,
  account,
  children,
}: {
  text: string
  account: AccountKey
  children: React.ReactNode
}) {
  const originalRef = useRef<typeof window.fetch | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    originalRef.current = window.fetch
    window.fetch = makeFetchMock(text, account) as typeof window.fetch
    setReady(true)
    return () => {
      if (originalRef.current) window.fetch = originalRef.current
    }
  }, [text, account])
  if (!ready) return null
  return <>{children}</>
}

const meta: Meta = {
  title: 'Ledger / Per-Account View Fixture',
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
}
export default meta

export const Default: StoryObj = {
  render: () => (
    <FetchHarness text={FIXTURE} account={ACCOUNT}>
      <PerAccountView account={ACCOUNT} />
    </FetchHarness>
  ),
}

export const PrefixScope: StoryObj = {
  render: () => (
    <FetchHarness text={PREFIX_FIXTURE} account={PREFIX_ACCOUNT}>
      <PerAccountView account={PREFIX_ACCOUNT} />
    </FetchHarness>
  ),
}

export const RealData: StoryObj = {
  render: () => (
    <FetchHarness text={REAL_FIXTURE} account={REAL_ACCOUNT}>
      <PerAccountView account={REAL_ACCOUNT} />
    </FetchHarness>
  ),
}
