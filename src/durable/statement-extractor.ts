import { Think, type TurnConfig, type TurnContext } from '@cloudflare/think'
import { Output, type ModelMessage } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { buildStatementExtractionPrompt } from './agent-prompt'
import { draftTransactionBatchSchema } from './agent-ui-schemas'
import { LedgerDO } from './ledger-do'

const MODEL_ID = '@cf/moonshotai/kimi-k2.6'

// Facet of LedgerDO. Receives `{ statement_id }` as its input from the
// main agent's `process_statement` agentTool call, fetches the actual
// statement bytes from the parent over RPC, runs a single
// structured-output turn against draftTransactionBatchSchema, and
// returns the parsed object back to the parent.
export class StatementExtractor extends Think {
  getModel() {
    const workersai = createWorkersAI({ binding: this.env.AI })
    return workersai(MODEL_ID, { reasoning_effort: 'low' })
  }

  // Placeholder — the real prompt is assembled in beforeTurn once we
  // have the statement filename + ledger snapshot from the parent.
  getSystemPrompt(): string {
    return 'You extract Beancount transactions from card / bank statement text.'
  }

  async beforeTurn(ctx: TurnContext): Promise<TurnConfig> {
    const statementId = this.extractStatementId(ctx.messages)
    if (!statementId) {
      throw new Error('StatementExtractor: input did not contain a STMT- id')
    }
    const parent = await this.parentAgent(LedgerDO)
    const fetched = await parent.get_statement(statementId)
    if (!fetched) {
      throw new Error(`StatementExtractor: statement ${statementId} not found`)
    }
    const snapshot = await parent.ledger_snapshot()
    const system = buildStatementExtractionPrompt(snapshot, fetched.filename)
    return {
      system,
      messages: [{ role: 'user', content: fetched.text }],
      output: Output.object({ schema: draftTransactionBatchSchema }),
      activeTools: [],
      maxRetries: 0,
      timeout: 240_000,
    }
  }

  // The default agentTool wiring puts the parent's JSON-stringified input
  // into a UIMessage user turn. Pull out `statement_id` from that, falling
  // back to a bare STMT-… string if the parent ever pre-formats it.
  private extractStatementId(messages: ModelMessage[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (!m || m.role !== 'user') continue
      const text = typeof m.content === 'string'
        ? m.content
        : m.content
            .map((p) => (p.type === 'text' ? p.text : ''))
            .join('')
      const direct = text.match(/STMT-[A-Za-z0-9-]+/)
      if (direct) return direct[0]
    }
    return null
  }

  // With `output: Output.object(...)` the assistant's final text is the JSON
  // the schema validated against. Parse it so the parent tool result is the
  // structured object, not a JSON string.
  override getAgentToolOutput(_runId: string): unknown {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i]
      if (!m || m.role !== 'assistant') continue
      const text = m.parts
        .map((p) => (p.type === 'text' ? p.text : ''))
        .join('')
        .trim()
      if (!text) continue
      try {
        return JSON.parse(text)
      } catch {
        return { transactions: [] }
      }
    }
    return { transactions: [] }
  }
}
