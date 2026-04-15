export type FakeResponse = {
  status?: number
  body: unknown
  delay?: number
}

export type Routes = Record<string, (req: Request) => FakeResponse | Promise<FakeResponse>>

export const defaultTxnRoutes: Routes = {
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
