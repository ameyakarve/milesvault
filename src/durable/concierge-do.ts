import { generateText, stepCountIs, type ToolSet } from 'ai'
import { createCodeTool } from '@cloudflare/codemode/ai'
import { DynamicWorkerExecutor } from '@cloudflare/codemode'
import { buildAnalystSystem, buildGraphWalkerSystem } from './agent-prompt'
import type { LedgerDO } from './ledger-do'
import { BaseAgentDO } from './base-agent-do'
import {
  makeConciergeRegistry,
  GRAPH_WALKER_MODEL_ID,
  type ConciergeAgentName,
} from './agents/registries/concierge'
import { makeAirportLookup, seedAirports } from './agents/tools/concierge/airports-store'
import type { AirportLookup } from './agents/tools/concierge/award-engine'
import {
  askUserTool,
  buildAwardExplore,
  type AwardExploreResult,
  buildPointsPaths,
  applyHoldings,
  type PointsPathsResult,
  type BalanceRow,
  listLoyaltyCurrencies,
  type LoyaltyCurrency,
  listMatchStatuses,
  heldStatusSlugs,
  buildStatusMatchPaths,
  type MatchStatusesResult,
  type StatusMatchResult,
  ensureRouteCache,
  fetchKbAgentsMd,
  kbHttpOverFetch,
  ledgerSnapshotTool,
  makeKbTools,
  querySqlTool,
  resolveByBeancountName,
  resolveByTicker,
  camelSpace,
  showAwardOptionsTool,
} from './agents/tools/concierge'
import type { AgentHost, Registry } from './agents/types'
import { baseAccount, isPending, kgLookupParts } from '@/lib/ledger-core/account-display'

// The chat/agent runtime for the `/concierge` surface. Read-only Q&A — over
// the user's ledger (`analyst`) and the milesvault knowledge graph
// (`graph-walker`). Pure compute: every read goes to LedgerDO over RPC
// (ledger) or to the kb worker over HTTP (graph). No writes.
type Snapshot = Awaited<ReturnType<LedgerDO['ledger_snapshot']>>

export type ConciergeDOState = Record<string, never>

function todayInt(): number {
  const now = new Date()
  const yyyy = now.getUTCFullYear().toString().padStart(4, '0')
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = now.getUTCDate().toString().padStart(2, '0')
  return Number(`${yyyy}${mm}${dd}`)
}

export class ConciergeDO
  extends BaseAgentDO<Cloudflare.Env, ConciergeDOState>
  implements AgentHost<ConciergeAgentName>
{
  protected registry: Registry
  initialState: ConciergeDOState = {}

  // Per-turn context. Both fetched once in beforeTurnFetch (async) so the
  // sync system-prompt builder + every step can reuse them without further
  // RPC. Cleared after the turn config is built — the next turn re-fetches.
  private turnSnapshot: Snapshot | null = null
  private turnAgentsBriefing: string | null = null

  // Synthetic host for the kb service binding — only the path is used.
  private readonly KB_BASE = 'https://kb'

  // IATA → [lat,lng,cc] over this DO's own SQLite, seeded once. Used by the
  // award engine to resolve legs.
  private readonly airportLookup: AirportLookup

  // This DO's own SQLite — also backs the 7-day route_cache that
  // flight_search reads/writes. (Named `routeSql` to avoid the inherited
  // `sql` tagged-template helper on the Think base class.)
  private readonly routeSql: SqlStorage

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)
    this.registry = makeConciergeRegistry(this)
    this.routeSql = state.storage.sql
    seedAirports(state.storage.sql)
    ensureRouteCache(state.storage.sql)
    this.airportLookup = makeAirportLookup(state.storage.sql)
  }

  private ledgerStub(): DurableObjectStub<LedgerDO> {
    const ns = this.env.LEDGER_DO as unknown as DurableObjectNamespace<LedgerDO>
    return ns.get(ns.idFromName(this.name))
  }

  private snapshot(): Snapshot {
    return (
      this.turnSnapshot ?? {
        today: todayInt(),
        accounts: [],
        row_counts: {},
        sample_txns: '',
        schema_ddl: '',
      }
    )
  }

  protected override async beforeTurnFetch(): Promise<void> {
    // Fetch both context sources in parallel. Either agent can hand off
    // mid-turn, so we can't gate on the agent active at turn start —
    // the receiving agent's system prompt is rebuilt per step.
    const [snapshot, briefing] = await Promise.all([
      this.ledgerStub().ledger_snapshot(),
      fetchKbAgentsMd(this.KB_BASE, this.env.KB).catch((err) => {
        console.warn(`[concierge] kb agents.md fetch failed: ${err}`)
        return ''
      }),
    ])
    this.turnSnapshot = snapshot
    this.turnAgentsBriefing = briefing
  }

  // ---- AgentHost<ConciergeAgentName> ----

  system(name: ConciergeAgentName): string {
    const base =
      name === 'graph-walker'
        ? buildGraphWalkerSystem(this.turnAgentsBriefing ?? '')
        : buildAnalystSystem(this.snapshot())
    return base + this.handoffContextBlock()
  }

  tools(name: ConciergeAgentName): ToolSet {
    if (name === 'graph-walker') {
      return this.graphWalkerTools()
    }
    return {
      query_sql: querySqlTool((sql, params) => this.ledgerStub().query_sql(sql, params)),
    }
  }

  // Data behind the fluid /explore page. Like awardPlan but returns a uniform
  // rows shape plus the distinct `airlines` for the include/exclude filter;
  // `source` is optional (miles-only when omitted). RPC for the
  // /api/concierge/award-explore route.
  async awardExplore(
    origin: string,
    destination: string,
    source?: string,
  ): Promise<AwardExploreResult> {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const ledger = this.ledgerStub()
    // When no explicit source, join the ledger holdings so rows can be
    // annotated with affordability. Mirror the pointsPaths() pattern exactly.
    const [snapshot, balances] = source && source.trim()
      ? [null, null]
      : await Promise.all([
          ledger.ledger_snapshot().catch((): null => null),
          ledger
            .query_sql('SELECT account, currency, scale, balance_scaled FROM balance_totals')
            .catch((): null => null),
        ])
    return buildAwardExplore(
      this.airportLookup,
      this.routeSql,
      this.env.AERODATABOX_API_KEY,
      kbHttp,
      origin,
      destination,
      source,
      snapshot?.accounts ?? null,
      (balances?.rows ?? null) as unknown as ReadonlyArray<BalanceRow> | null,
    )
  }

  // Data behind the /points page — the backward dual of the explorer. Given a
  // target loyalty currency, returns the React-Flow graph of every way to
  // accumulate it (currencies that transfer in + the cards that earn them),
  // each source tagged with its cheapest ratio. RPC for the
  // /api/concierge/points-paths route.
  async pointsPaths(target: string, amount?: number): Promise<PointsPathsResult> {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const ledger = this.ledgerStub()
    const [result, snapshot, balances] = await Promise.all([
      buildPointsPaths(kbHttp, target, amount),
      ledger.ledger_snapshot().catch((): null => null),
      ledger
        .query_sql('SELECT account, currency, scale, balance_scaled FROM balance_totals')
        .catch((): null => null),
    ])
    // Overlay the user's ledger: mark held nodes and attach current balances.
    applyHoldings(result, snapshot?.accounts ?? [], (balances?.rows ?? []) as BalanceRow[])
    return result
  }

  // The searchable target universe for the /points combobox — every loyalty
  // currency (slug + display name). RPC for /api/concierge/currencies.
  async loyaltyCurrencies(): Promise<LoyaltyCurrency[]> {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    return listLoyaltyCurrencies(kbHttp)
  }

  // Status Match Merry-Go-Round: a chain of status matches from one status to
  // another. RPC for /api/concierge/status-match-paths.
  async statusMatchPaths(from: string, to: string): Promise<StatusMatchResult> {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    return buildStatusMatchPaths(kbHttp, from, to)
  }

  // The searchable status universe (status-tiers + alliance-tiers) for the
  // merry-go-round from/to comboboxes, plus the tier slugs the user holds
  // (from `status:*` event directives, newest per program; empty when the
  // ledger has none). RPC for /api/concierge/match-statuses.
  async matchStatuses(): Promise<MatchStatusesResult> {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const [statuses, events] = await Promise.all([
      listMatchStatuses(kbHttp),
      this.ledgerStub()
        .query_sql(
          "SELECT name, value FROM directives_event WHERE name LIKE 'status:%' ORDER BY date ASC, id ASC",
        )
        .catch((): null => null),
    ])
    const rows = (events?.rows ?? []) as Array<{ name: string; value: string }>
    return { statuses, held: heldStatusSlugs(rows, statuses) }
  }

  // KG display names for the user's held accounts (cards via cc/ resolve
  // verified on attrs.beancountName, points/status via currency/ resolve —
  // the same verification matchAccount/applyHoldings use). Accounts the KG
  // doesn't know stay unset; the UI falls back to path-derived labels.
  // RPC for /api/concierge/account-names.
  // KG display names for held accounts. Currencies match by COMMODITY
  // ticker (the registry key — exact), falling back to beancountName text
  // resolution for accounts without a known commodity; cards match by
  // issuer+product name verified on beancountName. RPC for
  // /api/concierge/account-names.
  async accountNames(): Promise<{ names: Record<string, string> }> {
    const ledger = this.ledgerStub()
    const [snapshot, balances] = await Promise.all([
      ledger.ledger_snapshot().catch((): null => null),
      ledger
        .query_sql('SELECT account, currency FROM balance_totals')
        .catch((): null => null),
    ])
    const accounts = (snapshot?.accounts ?? []) as ReadonlyArray<{
      account: string
      currencies?: string[]
    }>
    const balRows = (balances?.rows ?? []) as Array<{ account: string; currency: string }>
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const names: Record<string, string> = {}

    // account → candidate commodities (open-directive constraints + balances)
    const commoditiesOf = (account: string): string[] => {
      const out = new Set<string>()
      for (const a of accounts) if (a.account === account) for (const c of a.currencies ?? []) out.add(c)
      for (const b of balRows) if (b.account === account) out.add(b.currency)
      return [...out]
    }

    await Promise.all(
      accounts.map(async ({ account }) => {
        if (isPending(account)) return // folds into its parent everywhere
        const parts = kgLookupParts(account)
        if (!parts) return
        if (parts.kind === 'currency') {
          for (const ticker of commoditiesOf(account)) {
            const byTicker = await resolveByTicker(kbHttp, ticker)
            if (byTicker?.display_name) {
              names[account] = byTicker.display_name
              return
            }
          }
          const hit = await resolveByBeancountName(
            kbHttp,
            [camelSpace(parts.leaf), parts.leaf],
            'currency',
            parts.leaf,
          )
          if (hit?.display_name) names[account] = hit.display_name
          return
        }
        const hit = await resolveByBeancountName(
          kbHttp,
          [
            `${parts.issuer} ${camelSpace(parts.product)}`,
            camelSpace(parts.product),
            `${parts.issuer} ${parts.product}`,
          ],
          'cc',
          parts.product,
        )
        if (hit?.display_name) names[account] = hit.display_name
      }),
    )
    return { names }
  }

  // Card → rewards linkage for the per-account page (owner ask): each held
  // credit card resolved in the KG (same beancountName verification as
  // accountNames), then DENOMINATED_IN → the currency it earns, matched back
  // to the user's Assets:Rewards account with its live balance. Cards the KG
  // doesn't know, or currencies without a held account, degrade gracefully
  // (name without link, or no entry). RPC for /api/concierge/card-links.
  async cardLinks(debug = false): Promise<{
    links: Array<{
      card: string
      rewards_account: string | null
      rewards_name: string | null
      rewards_currency: string | null
      rewards_balance: number | null
    }>
    trace?: Array<Record<string, unknown>>
  }> {
    const ledger = this.ledgerStub()
    const [snapshot, balances] = await Promise.all([
      ledger.ledger_snapshot().catch((): null => null),
      ledger
        .query_sql('SELECT account, currency, scale, balance_scaled FROM balance_totals')
        .catch((): null => null),
    ])
    const accounts = (snapshot?.accounts ?? []) as ReadonlyArray<{ account: string }>
    const balRows = (balances?.rows ?? []) as Array<{
      account: string
      currency: string
      scale: number
      balance_scaled: number
    }>
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    type RelItems = { items?: Array<{ other: string }> }
    type CurrencyNode = {
      display_name?: string | null
      attrs?: Record<string, unknown> | null
    }

    const cards = accounts.filter((a) => a.account.startsWith('Liabilities:CreditCards:'))
    const links: Array<{
      card: string
      rewards_account: string | null
      rewards_name: string | null
      rewards_currency: string | null
      rewards_balance: number | null
    }> = []

    const trace: Array<Record<string, unknown>> = []
    await Promise.all(
      cards.map(async ({ account }) => {
        const parts = kgLookupParts(account)
        if (!parts || parts.kind !== 'card') return
        const t: Record<string, unknown> = { card: account }
        if (debug) {
          t.query = `${parts.issuer} ${parts.product}`
          t.expected_beancountName = parts.product
          try {
            const raw = (await kbHttp.resolve(`${parts.issuer} ${parts.product}`, {
              prefix: 'cc',
              limit: 4,
            })) as { items?: Array<{ slug: string }> }
            t.resolve_candidates = (raw.items ?? []).map((i) => i.slug)
            t.candidate_attrs = await Promise.all(
              (raw.items ?? []).slice(0, 4).map(async (i) => {
                const n = (await kbHttp.get(i.slug).catch((): null => null)) as {
                  attrs?: Record<string, unknown> | null
                } | null
                return { slug: i.slug, beancountName: n?.attrs?.beancountName ?? null }
              }),
            )
          } catch (e) {
            t.resolve_error = String(e)
          }
          trace.push(t)
        }
        try {
          const hit = await resolveByBeancountName(
            kbHttp,
            [
              `${parts.issuer} ${camelSpace(parts.product)}`,
              camelSpace(parts.product),
              `${parts.issuer} ${parts.product}`,
            ],
            'cc',
            parts.product,
          )
          if (debug) t.verified_slug = hit?.slug ?? null
          if (!hit) return
          const rel = (await kbHttp.related(hit.slug, {
            edge_type: 'DENOMINATED_IN',
            direction: 'outgoing',
          })) as RelItems
          const currencySlugs = (rel.items ?? [])
            .map((i) => i.other)
            .filter((o) => o.startsWith('currency/'))
          if (debug) t.denominated_in = currencySlugs
          for (const slug of currencySlugs) {
            // Dangling DENOMINATED_IN targets exist in the corpus — a missing
            // node still yields a name-only banner from the slug.
            const node = (await kbHttp.get(slug).catch((): null => null)) as CurrencyNode | null
            const ticker = node?.attrs?.ticker
            const bn = node?.attrs?.beancountName
            const name =
              node?.display_name ??
              slug
                .replace(/^currency\//, '')
                .split('-')
                .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
                .join(' ')
            // Primary match: the user's account holding this COMMODITY
            // (ticker registry). Fallback: path-leaf === beancountName hint.
            const byTicker =
              typeof ticker === 'string' && ticker
                ? (accounts.find(
                    (a) =>
                      a.account.startsWith('Assets:Rewards:') &&
                      !isPending(a.account) &&
                      ((a as { currencies?: string[] }).currencies ?? []).includes(ticker),
                  )?.account ??
                  balRows.find(
                    (b) =>
                      b.account.startsWith('Assets:Rewards:') &&
                      !isPending(b.account) &&
                      b.currency === ticker,
                  )?.account ??
                  null)
                : null
            const byLeaf =
              typeof bn === 'string' && bn
                ? (accounts.find(
                    (a) =>
                      a.account.startsWith('Assets:Rewards:') &&
                      !isPending(a.account) &&
                      baseAccount(a.account).split(':').pop() === bn,
                  )?.account ?? null)
                : null
            const rewardsAccount = (byTicker ? baseAccount(byTicker) : null) ?? byLeaf
            if (!rewardsAccount) {
              links.push({
                card: account,
                rewards_account: null,
                rewards_name: name,
                rewards_currency: typeof ticker === 'string' ? ticker : null,
                rewards_balance: null,
              })
              break
            }
            let balance: number | null = null
            let currency: string | null = null
            if (rewardsAccount) {
              const rows = balRows.filter((b) => b.account === rewardsAccount)
              if (rows.length) {
                balance = rows.reduce((sum, b) => sum + Number(b.balance_scaled) / 10 ** b.scale, 0)
                currency = rows[0].currency
              } else {
                balance = 0
              }
            }
            links.push({
              card: account,
              rewards_account: rewardsAccount,
              rewards_name: name,
              rewards_currency: currency,
              rewards_balance: balance,
            })
            break // first earning currency is the card's programme
          }
        } catch {
          /* KG miss — no link for this card */
        }
      }),
    )
    return debug ? { links, trace } : { links }
  }

  // Headless one-shot turn for text-only channels (Telegram, WhatsApp …):
  // the graph-walker's brain and read tools, minus everything interactive —
  // ask_user suspends, show_award_options is gen-UI, handoff needs the chat
  // loop. Stateless by design: each bot message is one self-contained turn,
  // separate from the web chat's history. RPC for the bot adapter workers.
  async answerText(question: string): Promise<{ text: string }> {
    const briefing = await fetchKbAgentsMd(this.KB_BASE, this.env.KB).catch(() => '')
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const kb = makeKbTools(kbHttp)
    const ledger_snapshot = ledgerSnapshotTool(() => this.ledgerStub().ledger_snapshot())
    const executor = new DynamicWorkerExecutor({ loader: this.env.LOADER })
    const codemode = createCodeTool({ tools: { ...kb, ledger_snapshot }, executor })
    const query_sql = querySqlTool((sql, params) => this.ledgerStub().query_sql(sql, params))
    const system =
      buildGraphWalkerSystem(briefing) +
      '\n\nChannel: plain-text chat (a messaging app). Reply concisely in plain text — no markdown tables, no in-app links. For questions about the user\'s own balances or history, use ledger_snapshot / query_sql.'
    const result = await generateText({
      model: this.buildModel({ id: GRAPH_WALKER_MODEL_ID, reasoning: 'off' }),
      system,
      prompt: question,
      tools: { ...kb, ledger_snapshot, query_sql, codemode } as ToolSet,
      stopWhen: stepCountIs(10),
    })
    const text = result.text.trim()
    return { text: text || 'Sorry — I could not work out an answer to that.' }
  }

  // Graph-walker tool surface — layered. Simple one-hop graph lookups
  // go through the top-level kb tools; complex multi-hop or cross-domain
  // walks compose them inside the codemode sandbox; the model asks the
  // user only when an answer would meaningfully change.
  //
  // - `kb_resolve` / `kb_get` / `kb_related` / `kb_list`: same factories
  //   that codemode wraps internally, exposed at top level for one-shot
  //   queries (text→slug, slug→node, one edge lookup, one prefix list).
  // - `codemode`: AI-SDK tool that runs an LLM-written JS program in a
  //   Cloudflare Dynamic Worker isolate. Inside the program the same kb
  //   tools plus `ledger_snapshot` and `query_sql` are exposed as
  //   namespaced functions. Use for joins / conditional multi-hop walks.
  // - `ask_user`: pure-text suspending tool — model asks a question, the
  //   user's next chat message becomes the answer. No genUI.
  private graphWalkerTools(): ToolSet {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    const kb = makeKbTools(kbHttp)
    // Ledger access is the `ledger_snapshot` DO RPC only — no raw SQL.
    // It lists the user's accounts (their card summary). Exposed at TOP
    // LEVEL so the model can call it directly, AND inside codemode for
    // cross-domain programs.
    const ledger_snapshot = ledgerSnapshotTool(() => this.ledgerStub().ledger_snapshot())
    const executor = new DynamicWorkerExecutor({ loader: this.env.LOADER })
    const codemode = createCodeTool({
      tools: {
        ...kb,
        ledger_snapshot,
      },
      executor,
    })

    return {
      ...kb,
      ledger_snapshot,
      codemode,
      // Display-only gen-UI tool — emits a link to the /explore Award Explorer
      // page (origin + destination prefilled). All award pricing/ranking now
      // lives on that page; the agent never costs awards in chat.
      show_award_options: showAwardOptionsTool(),
      ask_user: askUserTool(),
    } as ToolSet
  }
}
