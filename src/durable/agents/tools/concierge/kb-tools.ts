import { tool } from 'ai'
import { z } from 'zod'

// Tool factories for the `graph-walker` Concierge agent. Each tool is a
// thin wrapper over a milesvault-kb HTTP endpoint. The fetcher is
// injected so the tools stay shareable across DOs (no closure over
// `this`) and easy to mock in tests.
//
// The KB worker hosts the corpus and exposes a small read API at
// /api/kb/*. All endpoints are unauthenticated (read-only knowledge,
// no per-user state).

export interface KbHttp {
  resolve(text: string, opts: { prefix?: string; limit?: number }): Promise<unknown>
  get(slug: string): Promise<unknown>
  related(
    slug: string,
    opts: {
      direction?: 'outgoing' | 'incoming' | 'both'
      edge_type?: string
      limit?: number
    },
  ): Promise<unknown>
  list(prefix: string, opts: { limit?: number }): Promise<unknown>
}

// Build the four traversal tools. They map 1:1 to the kb HTTP endpoints
// (kb_resolve / kb_get / kb_related / kb_list); the agent uses them to
// walk the graph in a few hops:
//
//   resolve("Marriott Bonvoy") → program/marriott-bonvoy
//   related(slug=program/marriott-bonvoy, edge_type=TRANSFERS_TO)
//     → list of currency slugs the points transfer to
//   get(slug=currency/asia-miles) → node body with transfer ratio detail
//
// The schema briefing (/api/kb/agents.md) is folded into the agent's
// system prompt, so the agent already knows what prefixes and edge
// types exist before its first tool call.
export function makeKbTools(http: KbHttp) {
  return {
    kb_resolve: tool({
      description:
        'Look up a node by free-text — partial display names, slug fragments, ' +
        'or alias slugs all match. Returns a ranked list of candidates. Pass ' +
        '`prefix` to restrict to a node type (e.g. `cc`, `program`, `currency`) ' +
        '— see the schema briefing in the system prompt. Use this FIRST when ' +
        "the user mentions something by name; you'll need a canonical slug " +
        'before calling kb_get or kb_related.',
      inputSchema: z.object({
        text: z.string().min(1).describe('Free text — name, partial name, or slug fragment.'),
        prefix: z
          .string()
          .optional()
          .describe('Optional slug prefix to filter results (e.g. "cc", "program").'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Max results to return. Defaults to 25, max 100.'),
      }),
      execute: async ({ text, prefix, limit }) => {
        try {
          return { ok: true as const, ...(await http.resolve(text, { prefix, limit })) as object }
        } catch (err) {
          return { ok: false as const, error: errMsg(err) }
        }
      },
    }),

    kb_get: tool({
      description:
        "Fetch a node's full content by slug — its display name, markdown body, " +
        'and (if the slug is an alias) the canonical it redirects to. Use this ' +
        'for the prose: rate tables, fees, eligibility rules, anything written ' +
        'in the node body. Slug shape is `<prefix>/<local>` (e.g. ' +
        '`cc/hdfc-infinia`). Returns null if the slug is unknown.',
      inputSchema: z.object({
        slug: z.string().min(3).describe('Prefixed slug, e.g. `cc/hdfc-infinia`.'),
      }),
      execute: async ({ slug }) => {
        try {
          const result = await http.get(slug)
          if (result === null) {
            return { ok: false as const, error: `slug not found: ${slug}` }
          }
          return { ok: true as const, ...(result as object) }
        } catch (err) {
          return { ok: false as const, error: errMsg(err) }
        }
      },
    }),

    kb_related: tool({
      description:
        'List edges to/from a node. The core traversal primitive — use this ' +
        "to walk the graph. Pass `edge_type` to filter (e.g. 'TRANSFERS_TO' " +
        "for currency transfers, 'ISSUED_BY' for card → bank). Direction " +
        "defaults to 'both'; pick 'outgoing' or 'incoming' to narrow. Each " +
        'edge carries a prose `description_md` (rate, cap, timing — read it!).',
      inputSchema: z.object({
        slug: z.string().min(3).describe('Prefixed slug whose edges you want.'),
        edge_type: z
          .string()
          .optional()
          .describe(
            'Optional edge-type filter. Valid types are listed in the system prompt.',
          ),
        direction: z
          .enum(['outgoing', 'incoming', 'both'])
          .optional()
          .describe('`outgoing` (slug → other), `incoming` (other → slug), or `both`. Defaults to `both`.'),
        limit: z.number().int().min(1).max(500).optional().describe('Max edges. Default 100.'),
      }),
      execute: async ({ slug, edge_type, direction, limit }) => {
        try {
          return {
            ok: true as const,
            ...(await http.related(slug, { edge_type, direction, limit })) as object,
          }
        } catch (err) {
          return { ok: false as const, error: errMsg(err) }
        }
      },
    }),

    kb_list: tool({
      description:
        'Enumerate every node under a given prefix. Use this to browse a type ' +
        "(e.g. prefix='cc' to see every credit card slug, prefix='program' for " +
        'every loyalty programme). Pair with kb_get for details on specific ' +
        'entries. Returns slugs in alphabetical order.',
      inputSchema: z.object({
        prefix: z
          .string()
          .min(1)
          .describe('Slug prefix without trailing slash, e.g. "cc" or "program".'),
        limit: z.number().int().min(1).max(1000).optional().describe('Max slugs. Default 200.'),
      }),
      execute: async ({ prefix, limit }) => {
        try {
          return { ok: true as const, ...(await http.list(prefix, { limit })) as object }
        } catch (err) {
          return { ok: false as const, error: errMsg(err) }
        }
      },
    }),
  }
}

// Minimal fetcher shape — both the global `fetch` and a Cloudflare
// service-binding `Fetcher` satisfy this. Using a structural type keeps
// the helpers Worker-runtime-agnostic (and easy to mock in tests).
export interface FetchLike {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>
}

const DEFAULT_FETCHER: FetchLike = { fetch: (input, init) => fetch(input, init) }

// Build a KbHttp implementation that hits the milesvault-kb worker. By
// default uses the global `fetch` over `baseUrl` (public URL); pass a
// Cloudflare service-binding Fetcher as `fetcher` to route in-process
// (host part of `baseUrl` is then irrelevant — only the path is used).
export function kbHttpOverFetch(
  baseUrl: string,
  fetcher: FetchLike = DEFAULT_FETCHER,
): KbHttp {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return {
    async resolve(text, opts) {
      const u = new URL(`${trimmed}/api/kb/resolve`)
      u.searchParams.set('text', text)
      if (opts.prefix) u.searchParams.set('prefix', opts.prefix)
      if (opts.limit !== undefined) u.searchParams.set('limit', String(opts.limit))
      return (await fetcher.fetch(u)).json()
    },
    async get(slug) {
      const u = new URL(`${trimmed}/api/kb/get`)
      u.searchParams.set('slug', slug)
      const r = await fetcher.fetch(u)
      if (r.status === 404) return null
      return r.json()
    },
    async related(slug, opts) {
      const u = new URL(`${trimmed}/api/kb/related`)
      u.searchParams.set('slug', slug)
      if (opts.direction) u.searchParams.set('direction', opts.direction)
      if (opts.edge_type) u.searchParams.set('edge_type', opts.edge_type)
      if (opts.limit !== undefined) u.searchParams.set('limit', String(opts.limit))
      return (await fetcher.fetch(u)).json()
    },
    async list(prefix, opts) {
      const u = new URL(`${trimmed}/api/kb/list`)
      u.searchParams.set('prefix', prefix)
      if (opts.limit !== undefined) u.searchParams.set('limit', String(opts.limit))
      return (await fetcher.fetch(u)).json()
    },
  }
}

// Fetch the agents.md schema briefing from the KB. Returns the raw
// markdown; the system-prompt builder pastes it verbatim. We don't cache
// across requests (the KbDO already sets Cache-Control: max-age=60).
export async function fetchKbAgentsMd(
  baseUrl: string,
  fetcher: FetchLike = DEFAULT_FETCHER,
): Promise<string> {
  const trimmed = baseUrl.replace(/\/+$/, '')
  const r = await fetcher.fetch(`${trimmed}/api/kb/agents.md`)
  if (!r.ok) {
    throw new Error(`kb agents.md fetch failed: ${r.status}`)
  }
  return r.text()
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
