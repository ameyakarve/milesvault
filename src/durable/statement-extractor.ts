import { DurableObject } from 'cloudflare:workers'
import { createWorkersAI } from 'workers-ai-provider'
import { streamText } from 'ai'
import { buildStatementExtractionPrompt } from './agent-prompt'

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

// Parent's RPC surface. Reasoning and text are streamed back as raw deltas
// so the parent can broadcast them to the browser on its existing WS.
type ParentStub = {
  appendExtractorPartial(
    statementId: string,
    reasoning: string,
    text: string,
  ): Promise<void>
  onExtractionComplete(
    statementId: string,
    text: string,
    reasoning: string,
  ): Promise<void>
  onExtractionFailed(
    statementId: string,
    error: string,
    reasoning?: string,
    text?: string,
  ): Promise<void>
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
    const baseSystem = buildStatementExtractionPrompt(snapshot, job.filename)
    // streamText emits free-form text. Beancount is already a textual
    // format, so we ask for raw entries rather than a JSON envelope —
    // simpler for the model, no escape-the-multiline-string trap.
    const system =
      baseSystem +
      `\n\n---\n\n# Output format (strict)\n\n` +
      `Emit the extracted transactions as raw Beancount entries, nothing ` +
      `else. Rules:\n\n` +
      `- One entry per transaction. Each entry starts with a \`YYYY-MM-DD\` ` +
      `date at column 0 (no leading whitespace), followed by postings on ` +
      `indented lines.\n` +
      `- Separate consecutive entries with a single blank line.\n` +
      `- No prose, no preamble, no summary, no closing remarks, no fenced ` +
      `code blocks, no comments narrating what you found. The reply is ` +
      `only Beancount.\n` +
      `- If the statement genuinely has nothing to extract, reply with an ` +
      `empty string. Do NOT invent placeholder entries.`
    const startedAt = Date.now()
    console.log(
      `[extractor] alarm start id=${job.id} filename=${job.filename} bytes=${job.text.length}`,
    )
    let reasoningBuf = ''
    let textBuf = ''
    try {
      const workersai = createWorkersAI({ binding: this.env.AI })
      const model = workersai(MODEL_ID, {
        chat_template_kwargs: { enable_thinking: false },
      })
      const { fullStream } = streamText({
        model,
        system,
        prompt: job.text,
        abortSignal: AbortSignal.timeout(240_000),
      })
      let lastFlushAt = 0
      let dirty = false
      for await (const part of fullStream) {
        if (part.type === 'reasoning-delta') {
          reasoningBuf += part.text
          dirty = true
        } else if (part.type === 'text-delta') {
          textBuf += part.text
          dirty = true
        } else if (part.type === 'error') {
          throw part.error instanceof Error
            ? part.error
            : new Error(String(part.error))
        } else {
          continue
        }
        const now = Date.now()
        if (dirty && now - lastFlushAt >= FLUSH_INTERVAL_MS) {
          await this.safeAppend(parent, job.id, reasoningBuf, textBuf)
          lastFlushAt = now
          dirty = false
        }
      }
      // Final flush so the UI sees the last few deltas before status flips.
      await this.safeAppend(parent, job.id, reasoningBuf, textBuf)

      this.sql.exec(
        `UPDATE job SET status='done', result_json=?, completed_at=? WHERE id=?`,
        textBuf,
        Date.now(),
        job.id,
      )
      const elapsedMs = Date.now() - startedAt
      console.log(
        `[extractor] done id=${job.id} elapsedMs=${elapsedMs} reasoningBytes=${reasoningBuf.length} textBytes=${textBuf.length}`,
      )
      await this.safeComplete(parent, job.id, textBuf, reasoningBuf)
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
      await this.safeFail(parent, job.id, message, reasoningBuf, textBuf)
    }
  }

  private getParentStub(parentName: string): ParentStub {
    const ns = this.env.LEDGER_DO
    return ns.get(ns.idFromName(parentName)) as unknown as ParentStub
  }

  private async safeAppend(
    parent: ParentStub,
    id: string,
    reasoning: string,
    text: string,
  ): Promise<void> {
    try {
      await parent.appendExtractorPartial(id, reasoning, text)
    } catch (e) {
      console.warn(`[extractor] appendExtractorPartial failed id=${id}`, {
        err: e instanceof Error ? e.message : String(e),
      })
    }
  }

  private async safeComplete(
    parent: ParentStub,
    id: string,
    text: string,
    reasoning: string,
  ): Promise<void> {
    try {
      await parent.onExtractionComplete(id, text, reasoning)
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
    reasoning?: string,
    text?: string,
  ): Promise<void> {
    try {
      await parent.onExtractionFailed(id, error, reasoning, text)
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

