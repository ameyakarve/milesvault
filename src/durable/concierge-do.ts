import type { ToolSet } from 'ai'
import { buildAnalystSystem } from './agent-prompt'
import type { LedgerDO } from './ledger-do'
import { BaseAgentDO } from './base-agent-do'
import {
  makeConciergeRegistry,
  type ConciergeAgentName,
} from './agents/registries/concierge'
import { querySqlTool } from './agents/tools/concierge'
import type { AgentHost, Registry } from './agents/types'

// The chat/agent runtime for the `/concierge` surface. Read-only Q&A over
// the user's ledger. Pure compute: every read (snapshot, ad-hoc SQL) goes
// to LedgerDO over RPC, keyed by the same per-user name. No writes.
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

  // The ledger snapshot for the current turn, fetched once in beforeTurnFetch
  // (async RPC) and reused by the sync system-prompt builder + every step.
  private turnSnapshot: Snapshot | null = null

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
    this.turnSnapshot = await this.ledgerStub().ledger_snapshot()
  }

  // ---- AgentHost<ConciergeAgentName> ----

  system(_name: ConciergeAgentName): string {
    return buildAnalystSystem(this.snapshot()) + this.handoffContextBlock()
  }

  tools(_name: ConciergeAgentName): ToolSet {
    return {
      query_sql: querySqlTool((sql, params) =>
        this.ledgerStub().query_sql(sql, params),
      ),
    }
  }
}
