export type FakeResponse = {
  status?: number
  body: unknown
  delay?: number
}

export type Routes = Record<string, (req: Request) => FakeResponse | Promise<FakeResponse>>

export const defaultTxnRoutes: Routes = {
  'POST /api/beancount/txns': async (req) => {
    const { text = '' } = (await req.json().catch(() => ({}))) as { text?: string }
    const count = Math.max(1, (text.match(/^\d{4}-\d{2}-\d{2}\s+[*!]/gm) ?? []).length)
    const created = Array.from({ length: count }, (_, i) => ({ index: i, id: 42 + i }))
    return {
      body: { created, errors: [], total: count },
      delay: 400,
    }
  },
  'PATCH /api/beancount/txns/:id': async () => ({
    body: { doc: { id: 42 } },
    delay: 400,
  }),
  'DELETE /api/txns/:id': async () => ({
    body: { id: 42 },
    delay: 300,
  }),
  'GET /api/accounts': async () => ({
    body: {
      docs: [
        { id: 1, path: 'Expenses:Food:Dining' },
        { id: 2, path: 'Expenses:Food:Groceries' },
        { id: 3, path: 'Expenses:Food:Coffee' },
        { id: 4, path: 'Expenses:Travel:Hotel' },
        { id: 5, path: 'Expenses:Travel:Flights' },
        { id: 6, path: 'Expenses:Rent' },
        { id: 7, path: 'Liabilities:CC:HDFC:Infinia' },
        { id: 8, path: 'Liabilities:CC:Axis:Magnus' },
        { id: 9, path: 'Assets:Bank:HDFC:Checking' },
        { id: 10, path: 'Assets:Cash' },
      ],
      totalDocs: 10,
    },
  }),
  'GET /api/commodities': async () => ({
    body: {
      docs: [
        { id: 1, code: 'INR' },
        { id: 2, code: 'USD' },
        { id: 3, code: 'EUR' },
        { id: 4, code: 'GBP' },
        { id: 5, code: 'AED' },
      ],
      totalDocs: 5,
    },
  }),
  'GET /api/txns': async () => ({
    body: {
      docs: [
        { id: 1, date: '2026-04-14', links: ['dinner-amudham'] },
        { id: 2, date: '2026-04-10', links: ['grocery-2026-04'] },
        { id: 3, date: '2026-04-05', links: ['hotel-goa-trip'] },
        { id: 4, date: '2026-04-01', links: ['rent-2026-04'] },
      ],
      totalDocs: 4,
    },
  }),
}

export function installFakeFetch(routes: Routes) {
  const realFetch = window.fetch
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = (
      init?.method || (input instanceof Request ? input.method : 'GET')
    ).toUpperCase()
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
