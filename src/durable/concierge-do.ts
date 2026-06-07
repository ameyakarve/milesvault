import type { ToolSet } from 'ai'
import { createCodeTool } from '@cloudflare/codemode/ai'
import { DynamicWorkerExecutor } from '@cloudflare/codemode'
import { buildAnalystSystem, buildGraphWalkerSystem } from './agent-prompt'
import type { LedgerDO } from './ledger-do'
import { BaseAgentDO } from './base-agent-do'
import { makeConciergeRegistry, type ConciergeAgentName } from './agents/registries/concierge'
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
  ensureRouteCache,
  fetchKbAgentsMd,
  kbHttpOverFetch,
  ledgerSnapshotTool,
  makeKbTools,
  querySqlTool,
  showAwardOptionsTool,
} from './agents/tools/concierge'
import type { AgentHost, Registry } from './agents/types'

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
    return buildAwardExplore(
      this.airportLookup,
      this.routeSql,
      this.env.AERODATABOX_API_KEY,
      kbHttp,
      origin,
      destination,
      source,
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
