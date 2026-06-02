import type { ToolSet } from 'ai'
import { createCodeTool } from '@cloudflare/codemode/ai'
import { DynamicWorkerExecutor } from '@cloudflare/codemode'
import { buildAnalystSystem, buildGraphWalkerSystem } from './agent-prompt'
import type { LedgerDO } from './ledger-do'
import { BaseAgentDO } from './base-agent-do'
import {
  makeConciergeRegistry,
  type ConciergeAgentName,
} from './agents/registries/concierge'
import {
  fetchKbAgentsMd,
  kbHttpOverFetch,
  ledgerSnapshotTool,
  makeKbTools,
  querySqlTool,
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

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)
    this.registry = makeConciergeRegistry(this)
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
      query_sql: querySqlTool((sql, params) =>
        this.ledgerStub().query_sql(sql, params),
      ),
    }
  }

  // Graph-walker runs in code-mode: the LLM writes one async JS program
  // that calls our tools as functions inside a Cloudflare Dynamic Worker
  // sandbox. The model sees a single `codemode` tool whose description is
  // generated from the underlying tool surface. All four kb traversal tools
  // plus a read-only ledger pair (snapshot + query_sql) are exposed, so a
  // program can join graph data with the user's actual transactions in one
  // execute call — no per-hop round-trip.
  private graphWalkerTools(): ToolSet {
    const kb = makeKbTools(kbHttpOverFetch(this.KB_BASE, this.env.KB))
    const ledger = {
      ledger_snapshot: ledgerSnapshotTool(() =>
        this.ledgerStub().ledger_snapshot(),
      ),
      query_sql: querySqlTool((sql, params) =>
        this.ledgerStub().query_sql(sql, params),
      ),
    }
    const executor = new DynamicWorkerExecutor({ loader: this.env.LOADER })
    const codemode = createCodeTool({
      tools: { ...kb, ...ledger },
      executor,
    })
    return { codemode } as ToolSet
  }
}
