import { DurableObject } from 'cloudflare:workers'
import { createWorkersAI } from 'workers-ai-provider'
import { streamObject } from 'ai'
import { buildStatementExtractionPrompt } from './agent-prompt'
import { draftTransactionBatchSchema, type DraftTransactionBatch } from './agent-ui-schemas'

const MODEL_ID = '@cf/moonshotai/kimi-k2.6'
const FLUSH_INTERVAL_MS = 200

type Snapshot = {
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
}

type JobRow = {
  id: string
  owner_email: string
  parent_name: string | null
  filename: string
  text: string
  snapshot_json: string | null
  status: 'ingested' | 'running' | 'done' | 'failed'
  result_json: string | null
  error: string | null
  created_at: number
  completed_at: number | null
}

// Parent's RPC surface that we call back into. Keep this minimal — the methods
// are added to LedgerDO as plain async methods so they pass DO-RPC validation.
type ParentStub = {
  appendExtractorPartial(
    statementId: string,
    partialJson: string,
    final: boolean,
  ): Promise<void>
  onExtractionComplete(
    statementId: string,
    result: DraftTransactionBatch,
  ): Promise<void>
  onExtractionFailed(statementId: string, error: string): Promise<void>
}

export class StatementExtractorDO extends DurableObject<Cloudflare.Env> {
  private sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS job (
        id TEXT PRIMARY KEY,
        owner_email TEXT NOT NULL,
        parent_name TEXT,
        filename TEXT NOT NULL,
        text TEXT NOT NULL,
        snapshot_json TEXT,
        status TEXT NOT NULL,
        result_json TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      )`)
    })
  }

  // Upload route → ExtractorDO. Bytes live here from now on; LedgerDO never
  // sees them.
  async ingest(opts: {
    statementId: string
    ownerEmail: string
    filename: string
    text: string
  }): Promise<{ ok: true } | { ok: false; error: 'already_ingested' }> {
    const existing = this.readJob()
    if (existing) return { ok: false, error: 'already_ingested' }
    this.sql.exec(
      `INSERT INTO job (id, owner_email, filename, text, status, created_at)
       VALUES (?, ?, ?, ?, 'ingested', ?)`,
      opts.statementId,
      opts.ownerEmail,
      opts.filename,
      opts.text,
      Date.now(),
    )
    return { ok: true }
  }

  // LedgerDO's process_statement tool → ExtractorDO. Returns in ms; the
  // alarm runs the actual inference.
  async kickoff(opts: {
    parentName: string
    snapshot: Snapshot
  }): Promise<
    | { ok: true }
    | { ok: false; error: 'not_found' | 'unauthorized' | 'wrong_status' }
  > {
    const job = this.readJob()
    if (!job) return { ok: false, error: 'not_found' }
    if (job.owner_email !== opts.parentName) {
      console.warn(
        `[extractor] kickoff unauthorized id=${job.id} owner=${job.owner_email} caller=${opts.parentName}`,
      )
      return { ok: false, error: 'unauthorized' }
    }
    if (job.status !== 'ingested' && job.status !== 'failed') {
      return { ok: false, error: 'wrong_status' }
    }
    this.sql.exec(
      `UPDATE job
         SET parent_name = ?, snapshot_json = ?, status = 'running',
             error = NULL, result_json = NULL, completed_at = NULL
       WHERE id = ?`,
      opts.parentName,
      JSON.stringify(opts.snapshot),
      job.id,
    )
    await this.ctx.storage.setAlarm(Date.now() + 50)
    return { ok: true }
  }

  async status(): Promise<JobRow | null> {
    return this.readJob()
  }

  async alarm(): Promise<void> {
    const job = this.readJob()
    if (!job || job.status !== 'running') return
    if (!job.parent_name || !job.snapshot_json) return
    const parent = this.getParentStub(job.parent_name)
    const snapshot = JSON.parse(job.snapshot_json) as Snapshot
    const system = buildStatementExtractionPrompt(snapshot, job.filename)
    const startedAt = Date.now()
    console.log(
      `[extractor] alarm start id=${job.id} filename=${job.filename} bytes=${job.text.length}`,
    )
    try {
      const workersai = createWorkersAI({ binding: this.env.AI })
      const model = workersai(MODEL_ID, { reasoning_effort: 'low' })
      const { partialObjectStream, object } = streamObject({
        model,
        schema: draftTransactionBatchSchema,
        system,
        prompt: job.text,
        abortSignal: AbortSignal.timeout(240_000),
      })
      let lastFlushAt = 0
      let pending: string | null = null
      let flushes = 0
      for await (const partial of partialObjectStream) {
        pending = JSON.stringify(partial)
        const now = Date.now()
        if (now - lastFlushAt >= FLUSH_INTERVAL_MS) {
          await this.safeAppend(parent, job.id, pending, false)
          pending = null
          lastFlushAt = now
          flushes++
        }
      }
      const final = await object
      // One last flush so the UI sees the final partial shape before the
      // completion callback flips status.
      if (pending) {
        await this.safeAppend(parent, job.id, pending, true)
        flushes++
      } else {
        await this.safeAppend(parent, job.id, JSON.stringify(final), true)
        flushes++
      }
      this.sql.exec(
        `UPDATE job SET status='done', result_json=?, completed_at=? WHERE id=?`,
        JSON.stringify(final),
        Date.now(),
        job.id,
      )
      const elapsedMs = Date.now() - startedAt
      console.log(
        `[extractor] done id=${job.id} count=${final.transactions.length} flushes=${flushes} elapsedMs=${elapsedMs}`,
      )
      await this.safeComplete(parent, job.id, final)
    } catch (e) {
      const elapsedMs = Date.now() - startedAt
      const message = e instanceof Error ? e.message : String(e)
      console.error(
        `[extractor] failed id=${job.id} elapsedMs=${elapsedMs}`,
        { err: message },
      )
      this.sql.exec(
        `UPDATE job SET status='failed', error=?, completed_at=? WHERE id=?`,
        message,
        Date.now(),
        job.id,
      )
      await this.safeFail(parent, job.id, message)
    }
  }

  private getParentStub(parentName: string): ParentStub {
    const ns = this.env.LEDGER_DO
    return ns.get(ns.idFromName(parentName)) as unknown as ParentStub
  }

  // Cross-DO RPC: swallow errors so a flaky parent gate doesn't bring down
  // the extraction. The final completion callback retries below.
  private async safeAppend(
    parent: ParentStub,
    id: string,
    partialJson: string,
    final: boolean,
  ): Promise<void> {
    try {
      await parent.appendExtractorPartial(id, partialJson, final)
    } catch (e) {
      console.warn(`[extractor] appendExtractorPartial failed id=${id}`, {
        err: e instanceof Error ? e.message : String(e),
      })
    }
  }

  private async safeComplete(
    parent: ParentStub,
    id: string,
    result: DraftTransactionBatch,
  ): Promise<void> {
    try {
      await parent.onExtractionComplete(id, result)
    } catch (e) {
      console.error(`[extractor] onExtractionComplete failed id=${id}`, {
        err: e instanceof Error ? e.message : String(e),
      })
    }
  }

  private async safeFail(
    parent: ParentStub,
    id: string,
    error: string,
  ): Promise<void> {
    try {
      await parent.onExtractionFailed(id, error)
    } catch (e) {
      console.error(`[extractor] onExtractionFailed failed id=${id}`, {
        err: e instanceof Error ? e.message : String(e),
      })
    }
  }

  private readJob(): JobRow | null {
    const rows = this.sql
      .exec<JobRow>(`SELECT * FROM job LIMIT 1`)
      .toArray()
    return rows[0] ?? null
  }
}
