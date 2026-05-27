import { Think } from '@cloudflare/think'
import { createWorkersAI } from 'workers-ai-provider'
import { generateObject, tool, type ToolSet, type UIMessage } from 'ai'
import { z } from 'zod'
import { buildStatementExtractionPrompt } from './agent-prompt'
import { draftTransactionBatchSchema } from './agent-ui-schemas'

const MODEL_ID = '@cf/moonshotai/kimi-k2.6'

const STATEMENT_ID_RE = /STMT-[a-f0-9-]+/i

// The child sees no chat history — only a single user turn that names the
// statement to process. Its sole job is to call run_extraction once; the
// tool's `execute` fetches the bytes from the parent, runs generateObject,
// and persists the result locally. The parent's main chat agent never sees
// the raw bytes.
const EXTRACT_SYSTEM = `You process a single bank/credit-card statement. You have ONE tool: \`run_extraction\`. Call it exactly once with no arguments. Do NOT respond in prose; do NOT narrate; just call the tool.`

type ParentStub = {
  getStatementText(
    id: string,
  ): Promise<{ filename: string; text: string } | null>
  ledger_snapshot(): Promise<{
    today: number
    accounts: Array<{
      account: string
      currencies: string[]
      open_date: number
      close_date: number | null
    }>
    row_counts: Record<string, number>
    sample_txns: string
    schema_ddl: string
  }>
}

export class StatementExtractor extends Think<Cloudflare.Env> {
  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)
    this.sql`
      CREATE TABLE IF NOT EXISTS extraction_runs (
        run_id TEXT PRIMARY KEY,
        result_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `
  }

  getModel() {
    const workersai = createWorkersAI({ binding: this.env.AI })
    return workersai(MODEL_ID, { reasoning_effort: 'low' })
  }

  getSystemPrompt(): string {
    return EXTRACT_SYSTEM
  }

  getTools(): ToolSet {
    return {
      run_extraction: tool({
        description:
          'Run the statement extraction. Call this exactly once with no arguments.',
        inputSchema: z.object({}),
        execute: async () => this.runExtraction(),
      }),
    }
  }

  private async runExtraction(): Promise<
    | { ok: true; count: number }
    | {
        ok: false
        error:
          | 'no_statement_id'
          | 'no_parent'
          | 'statement_not_found'
          | 'inference_failed'
          | 'empty_result'
        message?: string
      }
  > {
    const statementId = this.extractStatementId()
    if (!statementId) return { ok: false, error: 'no_statement_id' }

    const parentName = this.parentPath.at(-1)?.name
    if (!parentName) return { ok: false, error: 'no_parent' }
    const ns = this.env.LEDGER_DO
    const parent = ns.get(ns.idFromName(parentName)) as unknown as ParentStub

    const stmt = await parent.getStatementText(statementId)
    if (!stmt) return { ok: false, error: 'statement_not_found' }

    const snapshot = await parent.ledger_snapshot()
    const system = buildStatementExtractionPrompt(snapshot, stmt.filename)
    const startedAt = Date.now()
    console.log(
      `[statement_extractor] start id=${statementId} filename=${stmt.filename} bytes=${stmt.text.length}`,
    )
    try {
      const result = await generateObject({
        model: this.getModel(),
        schema: draftTransactionBatchSchema,
        system,
        prompt: stmt.text,
        abortSignal: AbortSignal.timeout(240_000),
      })
      const elapsedMs = Date.now() - startedAt
      const transactions = result.object.transactions
      if (transactions.length === 0) {
        console.warn(
          `[statement_extractor] empty id=${statementId} elapsedMs=${elapsedMs}`,
        )
        return { ok: false, error: 'empty_result' }
      }
      this.sql`
        INSERT OR REPLACE INTO extraction_runs (run_id, result_json, created_at)
        VALUES (${this.name}, ${JSON.stringify(result.object)}, ${Date.now()})
      `
      console.log(
        `[statement_extractor] done id=${statementId} count=${transactions.length} elapsedMs=${elapsedMs}`,
      )
      return { ok: true, count: transactions.length }
    } catch (e) {
      const elapsedMs = Date.now() - startedAt
      const message = e instanceof Error ? e.message : String(e)
      console.error(
        `[statement_extractor] failed id=${statementId} elapsedMs=${elapsedMs}`,
        { err: message },
      )
      return { ok: false, error: 'inference_failed', message }
    }
  }

  // The parent passes `{ statement_id }`; formatAgentToolInput wrote it into
  // the child's first user message. Read it back from history.
  private extractStatementId(): string | null {
    for (const msg of this.messages) {
      if (msg.role !== 'user') continue
      for (const part of msg.parts ?? []) {
        if (part.type !== 'text' || typeof part.text !== 'string') continue
        const m = part.text.match(STATEMENT_ID_RE)
        if (m) return m[0]
      }
    }
    return null
  }

  protected formatAgentToolInput(input: unknown): UIMessage {
    const id =
      typeof input === 'object' && input !== null && 'statement_id' in input
        ? String((input as { statement_id: unknown }).statement_id)
        : ''
    return {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: `Process statement ${id}.` }],
    }
  }

  protected getAgentToolOutput(runId: string): unknown {
    const rows = this.sql<{ result_json: string }>`
      SELECT result_json FROM extraction_runs WHERE run_id = ${runId}
    `
    if (rows.length === 0) return undefined
    try {
      return JSON.parse(rows[0]!.result_json)
    } catch {
      return undefined
    }
  }

  protected getAgentToolSummary(_runId: string, output: unknown): string {
    if (!output || typeof output !== 'object') return ''
    const obj = output as { transactions?: unknown }
    const n = Array.isArray(obj.transactions) ? obj.transactions.length : 0
    return `Extracted ${n} transactions.`
  }
}
