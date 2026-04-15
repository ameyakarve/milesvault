import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { TxnEditCard } from './txn-edit-card'

type FakeResponse = {
  status?: number
  body: unknown
  delay?: number
}

type Routes = Record<string, (req: Request) => FakeResponse | Promise<FakeResponse>>

const defaultRoutes: Routes = {
  'POST /api/beancount/txns': async () => ({
    body: { created: [{ index: 0, id: 42 }], errors: [], total: 1 },
    delay: 400,
  }),
  'PATCH /api/beancount/txns/:id': async () => ({
    body: { doc: { id: 42 } },
    delay: 400,
  }),
  'DELETE /api/txns/:id': async () => ({
    body: { id: 42 },
    delay: 300,
  }),
}

function installFakeFetch(routes: Routes) {
  const realFetch = window.fetch
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const path = new URL(url, 'http://localhost').pathname

    const match = Object.entries(routes).find(([key]) => {
      const [m, pattern] = key.split(' ')
      if (m !== method) return false
      const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$')
      return regex.test(path)
    })

    if (!match) {
      // eslint-disable-next-line no-console
      console.warn('[storybook fake-fetch] unmatched', method, path)
      return new Response(JSON.stringify({ error: 'not mocked' }), { status: 404 })
    }

    const req = new Request(url, init)
    const res = await match[1](req)
    if (res.delay) await new Promise((r) => setTimeout(r, res.delay))
    return new Response(JSON.stringify(res.body), {
      status: res.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return () => {
    window.fetch = realFetch
  }
}

const meta: Meta<typeof TxnEditCard> = {
  title: 'Chat/TxnEditCard',
  component: TxnEditCard,
  decorators: [
    (Story, context) => {
      const routes = (context.parameters.routes as Routes) ?? defaultRoutes
      installFakeFetch(routes)
      return (
        <div style={{ maxWidth: 680 }}>
          <Story />
        </div>
      )
    },
  ],
}

export default meta
type Story = StoryObj<typeof TxnEditCard>

export const DraftSimple: Story = {
  args: {
    initialDraft: {
      date: '2026-04-14',
      flag: '*',
      payee: 'Someplace',
      narration: 'Dinner',
      postings: [
        { account: 'Expenses:Food:Dining', amount: 1500, commodity: 'INR' },
        { account: 'Liabilities:CC:HDFC:Infinia', amount: -1500, commodity: 'INR' },
      ],
    },
  },
}

export const DraftWithRewards: Story = {
  args: {
    initialDraft: {
      date: '2026-04-14',
      flag: '*',
      payee: 'Someplace',
      narration: 'Dinner with SmartBuy earn',
      postings: [
        { account: 'Expenses:Food:Dining', amount: 1500, commodity: 'INR' },
        { account: 'Liabilities:CC:HDFC:Infinia', amount: -1500, commodity: 'INR' },
        { account: 'Assets:Rewards:HDFC:SmartBuy', amount: 50, commodity: 'SMARTBUY_POINTS' },
        { account: 'Income:Rewards:HDFC:Earned', amount: -50, commodity: 'SMARTBUY_POINTS' },
      ],
    },
  },
}

export const Locked: Story = {
  args: {
    ...DraftSimple.args,
    locked: true,
  },
}

export const ServerRejects: Story = {
  args: DraftSimple.args,
  parameters: {
    routes: {
      ...defaultRoutes,
      'POST /api/beancount/txns': async () => ({
        status: 400,
        body: {
          error: 'Parse error',
          detail: 'Unbalanced transaction: INR sums to 100 (tolerance 0.005)',
        },
        delay: 400,
      }),
    },
  },
}
