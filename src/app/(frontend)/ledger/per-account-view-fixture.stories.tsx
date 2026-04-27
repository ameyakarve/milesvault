import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import React, { useEffect, useRef, useState } from 'react'
import { PerAccountView } from './per-account-view'

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

function makeFetchMock(text: string) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const body = (data: unknown) =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    if (url.endsWith('/journal') && (!init || !init.method || init.method === 'GET')) {
      return body({ text })
    }
    if (url.includes('/currencies')) {
      return body({ currencies: ['INR'] })
    }
    if (url.includes('/recent') && init?.method === 'POST') {
      return body({ ok: true })
    }
    if (url.includes('/recent')) {
      return body({ accounts: [ACCOUNT] })
    }
    if (init?.method === 'PUT') {
      return body({ text, inserted: 0, deleted: 0, unchanged: 0 })
    }
    return body({})
  }
}

function FetchHarness({ text, children }: { text: string; children: React.ReactNode }) {
  const originalRef = useRef<typeof window.fetch | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    originalRef.current = window.fetch
    window.fetch = makeFetchMock(text) as typeof window.fetch
    setReady(true)
    return () => {
      if (originalRef.current) window.fetch = originalRef.current
    }
  }, [text])
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
    <FetchHarness text={FIXTURE}>
      <PerAccountView account={ACCOUNT} />
    </FetchHarness>
  ),
}
