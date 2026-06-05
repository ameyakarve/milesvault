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
  awardOptionsTool,
  awardQuoteTool,
  buildAwardPlan,
  type AwardPlanResult,
  buildAwardExplore,
  type AwardExploreResult,
  ensureRouteCache,
  fetchKbAgentsMd,
  flightSearchTool,
  kbHttpOverFetch,
  ledgerSnapshotTool,
  makeKbTools,
  querySqlTool,
  showAwardOptionsTool,
  transferMatrixTool,
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

  // Read-only award plan behind the interactive award-options card. Runs the
  // deterministic pipeline end to end (every routing × programme, priced, then
  // joined against the transfers graph from `source`) and returns every
  // combination for the client to filter/sort. Reuses this DO's seeded airport
  // lookup + 7-day route cache; the data isn't per-user. `source` is a card or
  // currency name/slug, resolved against the KB. Exposed as a DO RPC method for
  // the /api/concierge/award-options route.
  async awardPlan(origin: string, destination: string, source: string): Promise<AwardPlanResult> {
    const kbHttp = kbHttpOverFetch(this.KB_BASE, this.env.KB)
    return buildAwardPlan(
      this.airportLookup,
      this.routeSql,
      this.env.AERODATABOX_API_KEY,
      kbHttp,
      origin,
      destination,
      source,
    )
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
    // Batch award-chart pricing (stub: returns not_implemented). Top level
    // for one-shot quotes, and inside codemode so a program can price an
    // itinerary and pivot to "how do I earn those miles?" in one walk.
    const award_quote = awardQuoteTool(this.airportLookup)
    // Route/connection discovery from real schedules (AeroDataBox, 7-day
    // cached per airport). Feeds carriers+legs into award_quote. Top level
    // for one-shot searches and inside codemode so a program can discover a
    // routing then price it in one walk.
    const flight_search = flightSearchTool(this.routeSql, this.env.AERODATABOX_API_KEY)
    // End-to-end award ranking: routings × the card's reachable programmes,
    // priced through the engine, own-metal from the KB OWN_METAL edge, ranked
    // direct → distance → own-metal. The deterministic path for "best award
    // options" — the model walks the card's partners then calls this once.
    const award_options = awardOptionsTool(
      this.airportLookup,
      this.routeSql,
      this.env.AERODATABOX_API_KEY,
      kbHttp,
    )
    // Pure transfers-graph traversal: cost matrix to move points across reward
    // currencies (BFS, ratio-composed). Standalone for "how do my points move"
    // questions; also the funding primitive award_options uses internally.
    const transfer_matrix = transferMatrixTool(kbHttp)
    const executor = new DynamicWorkerExecutor({ loader: this.env.LOADER })
    const codemode = createCodeTool({
      tools: {
        ...kb,
        ledger_snapshot,
        award_quote,
        flight_search,
        award_options,
        transfer_matrix,
      },
      executor,
    })

    return {
      ...kb,
      ledger_snapshot,
      award_quote,
      flight_search,
      award_options,
      transfer_matrix,
      codemode,
      // Display-only gen-UI tool — renders the interactive award-options card.
      // Top level only (NOT in codemode); the card self-fetches its data.
      show_award_options: showAwardOptionsTool(),
      ask_user: askUserTool(),
    } as ToolSet
  }
}
