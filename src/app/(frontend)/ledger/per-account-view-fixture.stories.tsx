import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import React, { useEffect, useRef, useState } from 'react'
import { PerAccountView } from './per-account-view'
import { NotebookShell } from './notebook-shell'
import { OverviewView, BANK_OVERVIEW_SAMPLE } from './overview-view'
import { StatementView, type StatementRowData } from './statement-view'
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

function makeFetchMock(
  text: string,
  account: AccountKey,
  currencies: string[] = ['INR'],
) {
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
      return body({ currencies })
    }
    if (url.includes('/children')) {
      const parsed = parseJournal(text)
      const prefix = account + ':'
      const seen = new Set<string>()
      for (const tx of parsed.transactions) {
        for (const p of tx.postings ?? []) {
          if (p.account?.startsWith(prefix)) {
            seen.add(p.account.slice(prefix.length).split(':')[0]!)
          }
        }
      }
      for (const d of parsed.directives) {
        const acct = (d as { account?: string }).account
        if (acct && acct.startsWith(prefix)) {
          seen.add(acct.slice(prefix.length).split(':')[0]!)
        }
      }
      return body({ children: Array.from(seen).sort() })
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
  currencies,
  children,
}: {
  text: string
  account: AccountKey
  currencies?: string[]
  children: React.ReactNode
}) {
  const originalRef = useRef<typeof window.fetch | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    originalRef.current = window.fetch
    window.fetch = makeFetchMock(text, account, currencies) as typeof window.fetch
    setReady(true)
    return () => {
      if (originalRef.current) window.fetch = originalRef.current
    }
  }, [text, account, currencies])
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

export const MultiCurrency: StoryObj = {
  render: () => (
    <FetchHarness text={FIXTURE} account={ACCOUNT} currencies={['INR', 'USD', 'CNY']}>
      <PerAccountView account={ACCOUNT} />
    </FetchHarness>
  ),
}

const STATEMENT_ACCOUNT = 'Liabilities:CreditCard:HDFC:DinersBlack'

const STATEMENT_ROWS: StatementRowData[] = [
  {
    id: 'r1',
    startLine: 0,
    endLine: 0,
    date: '2023-11-20',
    payee: 'Amazon India',
    narration: 'Cloud Subscription',
    debit: '1,249.00',
    credit: null,
    balance: '1,31,000.00',
    text: `2023-11-20 * "Amazon India" "Cloud Subscription"\n  ${STATEMENT_ACCOUNT}                       -1,249.00 INR\n  Expenses:Software                                       1,249.00 INR\n`,
    otherPostings: [{ account: 'Expenses:Software', amountSigned: '+1,249.00 INR' }],
    postedDate: '2023-11-20',
  },
  {
    id: 'r2',
    startLine: 0,
    endLine: 0,
    date: '2023-11-21',
    payee: 'Starbucks Coffee',
    narration: 'Morning Brew',
    debit: '450.00',
    credit: null,
    balance: '1,30,550.00',
    text: `2023-11-21 * "Starbucks Coffee" "Morning Brew"\n  ${STATEMENT_ACCOUNT}                         -450.00 INR\n  Expenses:Food:Coffee                                      450.00 INR\n`,
    otherPostings: [{ account: 'Expenses:Food:Coffee', amountSigned: '+450.00 INR' }],
    postedDate: '2023-11-21',
  },
  {
    id: 'r3',
    startLine: 0,
    endLine: 0,
    date: '2023-11-22',
    payee: 'HDFC Bank',
    narration: 'Interest Credit',
    debit: null,
    credit: '3,450.00',
    balance: '1,34,000.00',
    text: `2023-11-22 * "HDFC Bank" "Interest Credit"\n  ${STATEMENT_ACCOUNT}                        3500.00 INR\n  Income:Interest                                       -3,500.00 INR\n`,
    draftText: `2023-11-22 * "HDFC Bank" "Interest Credit"\n  ${STATEMENT_ACCOUNT}                        3,450.00 INR\n  Income:Interest                                       -3,450.00 INR\n`,
    otherPostings: [{ account: 'Income:Interest', amountSigned: '−3,450.00 INR' }],
    postedDate: '2023-11-22',
    txnHash: 'ab9c1234',
    reconciled: true,
  },
  {
    id: 'r4',
    startLine: 0,
    endLine: 0,
    date: '2023-11-23',
    payee: 'Apple Store',
    narration: 'App Store Purchase',
    debit: '199.00',
    credit: null,
    balance: '1,33,801.00',
    text: `2023-11-23 * "Apple Store" "App Store Purchase"\n  ${STATEMENT_ACCOUNT}                         -199.00 INR\n  Expenses:Software                                         199.00 INR\n`,
    otherPostings: [{ account: 'Expenses:Software', amountSigned: '+199.00 INR' }],
    postedDate: '2023-11-23',
  },
  {
    id: 'r5',
    startLine: 0,
    endLine: 0,
    date: '2023-11-24',
    payee: 'Zomato Limited',
    narration: 'Dinner Order',
    debit: '890.00',
    credit: null,
    balance: '1,32,911.00',
    text: `2023-11-24 * "Zomato Limited" "Dinner Order"\n  ${STATEMENT_ACCOUNT}                         -890.00 INR\n  Expenses:Food                                             890.00 INR\n`,
    otherPostings: [{ account: 'Expenses:Food', amountSigned: '+890.00 INR' }],
    postedDate: '2023-11-24',
  },
  {
    id: 'r6',
    startLine: 0,
    endLine: 0,
    date: '2023-11-25',
    narration: 'Salary Credit',
    debit: null,
    credit: '2,80,000.00',
    balance: '4,12,911.00',
    text: `2023-11-25 * "Salary Credit"\n  ${STATEMENT_ACCOUNT}                      2,80,000.00 INR\n  Income:Salary                                       -2,80,000.00 INR\n`,
    otherPostings: [{ account: 'Income:Salary', amountSigned: '−2,80,000.00 INR' }],
    postedDate: '2023-11-25',
  },
  {
    id: 'r7',
    startLine: 0,
    endLine: 0,
    date: '2023-11-26',
    narration: 'BESCOM',
    debit: '3,420.00',
    credit: null,
    balance: '4,09,491.00',
    text: `2023-11-26 * "BESCOM"\n  ${STATEMENT_ACCOUNT}                       -3,420.00 INR\n  Expenses:Utilities                                      3,420.00 INR\n`,
    otherPostings: [{ account: 'Expenses:Utilities', amountSigned: '+3,420.00 INR' }],
    postedDate: '2023-11-26',
  },
  {
    id: 'r8',
    startLine: 0,
    endLine: 0,
    date: '2023-11-28',
    narration: 'Swiggy',
    debit: '1,245.00',
    credit: null,
    balance: '4,08,246.00',
    text: `2023-11-28 * "Swiggy"\n  ${STATEMENT_ACCOUNT}                       -1,245.00 INR\n  Expenses:Food                                           1,245.00 INR\n`,
    otherPostings: [{ account: 'Expenses:Food', amountSigned: '+1,245.00 INR' }],
    postedDate: '2023-11-28',
  },
]

export const Overview: StoryObj = {
  render: () => (
    <NotebookShell
      breadcrumb={['Assets', 'Bank', 'HDFC', 'Savings']}
      accountTitle="Savings"
      accountPath="Assets:Bank:HDFC:Savings"
      cards={[]}
      txnCount={42}
      currency="INR"
      overviewBody={<OverviewView {...BANK_OVERVIEW_SAMPLE} />}
    />
  ),
}

export const Statement: StoryObj = {
  render: () => (
    <NotebookShell
      breadcrumb={['Liabilities', 'CreditCard', 'HDFC', 'DinersBlack']}
      accountTitle="DinersBlack"
      accountPath={STATEMENT_ACCOUNT}
      cards={[]}
      txnCount={8}
      currency="INR"
      expandedView={{
        onBack: () => {},
        statementBody: (
          <StatementView
            rows={STATEMENT_ROWS}
            totalDebit="7,453.00"
            totalCredit="2,83,450.00"
            netChange="+2,75,997.00"
            netPositive={true}
            initialExpandedId="r3"
          />
        ),
      }}
    />
  ),
}
