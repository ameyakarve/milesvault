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
  // Whole source file (path from a node's `source_file`) — markdown sections
  // outside the ::node block (e.g. a card's "## Logging") live only here.
  getFile(path: string): Promise<unknown>
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
// Output schemas — these are the SHAPES code-mode generates TS types from.
// Match the milesvault-kb HTTP response shapes verbatim; the LLM reads the
// generated types and writes sandbox code against them. Wrong shapes here =
// the model guesses field names and the program crashes at runtime.
const RESOLVE_OUTPUT = z.object({
  ok: z.literal(true),
  items: z.array(
    z.object({
      slug: z.string(),
      display_name: z.string().nullable(),
      match: z.enum(['exact', 'prefix', 'substring', 'alias', 'content']),
    }),
  ),
})

const GET_OUTPUT = z.object({
  ok: z.literal(true),
  slug: z.string(),
  source_file: z.string(),
  display_name: z.string().nullable(),
  content_md: z.string(),
  // Typed node attributes. For bank / cc / currency nodes this carries
  // `beancountName` — the canonical Beancount account segment to use when
  // writing ledger entries (bank → issuer, cc → product, currency → the
  // Assets:Rewards:Points leaf). Null when the node's prefix declares none.
  attrs: z.record(z.string(), z.unknown()).nullable().optional(),
  aliased_from: z.string().optional(),
})

const RELATED_OUTPUT = z.object({
  ok: z.literal(true),
  items: z.array(
    z.object({
      edge_type: z.string(),
      direction: z.enum(['outgoing', 'incoming']),
      other: z.string(),
      description_md: z.string().nullable(),
      // Typed edge attributes (e.g. TRANSFERS_TO carries
      // { ratio_source, ratio_dest }). Null when the edge type has none.
      attrs: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
  ),
})

const LIST_OUTPUT = z.object({
  ok: z.literal(true),
  items: z.array(
    z.object({
      slug: z.string(),
      display_name: z.string().nullable().optional(),
      aliases: z.array(z.string()).optional(),
    }),
  ),
})

const ERROR_OUTPUT = z.object({
  ok: z.literal(false),
  error: z.string(),
})

export function makeKbTools(http: KbHttp) {
  return {
    kb_resolve: tool({
      description:
        'Look up a node by free-text — partial display names, slug fragments, ' +
        'or alias slugs all match. Returns `{ items }` (ranked candidates). ' +
        'Each item is `{ slug, display_name, match }` where `match` is one of ' +
        "'exact' | 'prefix' | 'substring' | 'alias' | 'content'. Pass `prefix` " +
        'to restrict to a node type (e.g. "cc", "program", "currency"). Use ' +
        "this FIRST when the user mentions something by name — you'll need a " +
        'canonical slug before calling kb_get or kb_related.',
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
      outputSchema: z.union([RESOLVE_OUTPUT, ERROR_OUTPUT]),
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
        "Fetch a node's full content by slug. Returns " +
        '`{ slug, source_file, display_name, content_md, attrs?, aliased_from? }`. ' +
        'If the input slug is an alias, `slug` is the canonical and ' +
        '`aliased_from` is the input. Use this for prose (rate tables, fees, ' +
        'eligibility rules). `attrs.beancountName` (on bank / cc / currency ' +
        'nodes) is the canonical Beancount account segment for writing ledger ' +
        'entries. Slug shape is `<prefix>/<local>` (e.g. `cc/hdfc-infinia`). ' +
        'Returns `{ ok: false, error }` if the slug is unknown.',
      inputSchema: z.object({
        slug: z.string().min(3).describe('Prefixed slug, e.g. `cc/hdfc-infinia`.'),
      }),
      outputSchema: z.union([GET_OUTPUT, ERROR_OUTPUT]),
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
        'List edges to/from a node. Core traversal primitive. Returns ' +
        '`{ items }` where each item is `{ edge_type, direction, other, ' +
        "description_md }`. `other` is the slug on the OTHER side of the " +
        "edge — for an outgoing edge it's the `to_slug`, for incoming it's " +
        "the `from_slug` (flattened so you don't have to branch). Pass " +
        "`edge_type` to filter (e.g. 'TRANSFERS_TO', 'BOOKS_ON'). " +
        "Direction defaults to 'both'; pick 'outgoing' or 'incoming' to " +
        'narrow. Read `description_md` — it has the ratio, cap, timing.',
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
      outputSchema: z.union([RELATED_OUTPUT, ERROR_OUTPUT]),
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
        'Enumerate every node under a given prefix. Returns `{ items }` where ' +
        'each item is `{ slug, display_name, aliases }` — `aliases` are the other ' +
        'slugs that redirect to it, so you can match a node by any of its names. ' +
        "Use this to browse a type (e.g. prefix='cc' for every credit card, " +
        "prefix='program' for every loyalty programme). Pair with kb_get for " +
        'details. Items are alphabetical by slug.',
      inputSchema: z.object({
        prefix: z
          .string()
          .min(1)
          .describe('Slug prefix without trailing slash, e.g. "cc" or "program".'),
        limit: z.number().int().min(1).max(1000).optional().describe('Max slugs. Default 200.'),
      }),
      outputSchema: z.union([LIST_OUTPUT, ERROR_OUTPUT]),
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
// Resolve free text to a node VERIFIED by its beancountName attribute.
// resolve() items carry no attrs (see RESOLVE_OUTPUT), so each candidate is
// confirmed via get() — the bug class this prevents: silently matching the
// wrong card/currency, or matching nothing at all.
// Ledger segments are PascalCase ("SmartEarn", "MembershipRewards") while KG
// display names are spaced ("Amex Smart Earn") — and kb_resolve matches the
// literal text, so the camel form alone finds nothing. Split it for querying.
export function camelSpace(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ')
}

export async function resolveByBeancountName(
  kb: KbHttp,
  texts: string | string[],
  prefix: string,
  beancountName: string,
  opts: {
    // When set, a verified hit's display_name must contain this token
    // (case-insensitive) — disambiguates generic pool names ("RewardPoints"
    // is shared by a dozen banks) using issuer context from the path.
    displayMustContain?: string
  } = {},
): Promise<{ slug: string; display_name: string | null } | null> {
  const base = Array.isArray(texts) ? texts : [texts]
  // Word-level recall in addition to the full phrases: kb.resolve substring-
  // matches on display_name, so a single word ("Live") surfaces "HSBC Live+"
  // where the phrase "Live Plus" never does. The exact beancountName check
  // below still gates every candidate, so broad recall can't pick a wrong card.
  const words = base.flatMap((t) => t.split(/\s+/)).filter((w) => w.length >= 3)
  const queries = [...new Set([...base, ...words])]
  const tried = new Set<string>()
  const verified: Array<{ slug: string; display_name: string | null }> = []
  const want = opts.displayMustContain?.toLowerCase()
  for (const text of queries) {
    try {
      const r = (await kb.resolve(text, { prefix, limit: 6 })) as {
        items?: Array<{ slug: string }>
      }
      for (const item of r.items ?? []) {
        if (tried.has(item.slug)) continue
        tried.add(item.slug)
        try {
          const node = (await kb.get(item.slug)) as {
            display_name?: string | null
            attrs?: Record<string, unknown> | null
          } | null
          if (node?.attrs?.beancountName !== beancountName) continue
          if (want && !(node.display_name ?? '').toLowerCase().includes(want)) continue
          verified.push({ slug: item.slug, display_name: node.display_name ?? null })
        } catch {
          /* try the next candidate */
        }
      }
    } catch {
      /* this query failed — try the next */
    }
  }
  // Exactly one verified hit or nothing — a generic name matching several
  // nodes is ambiguous, and a wrong name is worse than no name.
  return verified.length === 1 ? verified[0] : null
}

// Resolve a Beancount commodity ticker to its currency node — exact, via the
// ticker registry (every currency carries attrs.ticker + a ticker alias).
export async function resolveByTicker(
  kb: KbHttp,
  ticker: string,
): Promise<{ slug: string; display_name: string | null; attrs: Record<string, unknown> | null } | null> {
  try {
    const r = (await kb.resolve(ticker, { prefix: 'currency', limit: 4 })) as {
      items?: Array<{ slug: string }>
    }
    for (const item of r.items ?? []) {
      try {
        const node = (await kb.get(item.slug)) as {
          display_name?: string | null
          attrs?: Record<string, unknown> | null
        } | null
        if (node?.attrs?.ticker === ticker) {
          return { slug: item.slug, display_name: node.display_name ?? null, attrs: node.attrs ?? null }
        }
      } catch {
        /* next candidate */
      }
    }
  } catch {
    /* resolve failed */
  }
  return null
}

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
    async getFile(path) {
      const u = new URL(`${trimmed}/api/kb/file`)
      u.searchParams.set('path', path)
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
