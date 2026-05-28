import { Agent, type AgentContext } from 'agents'
import { createWorkersAI } from 'workers-ai-provider'
import { streamText } from 'ai'
import { buildStatementExtractionPrompt } from './agent-prompt'

const MODEL_ID = '@cf/moonshotai/kimi-k2.6'
const EXTRACTION_TIMEOUT_MS = 240_000
// Hard ceiling on a job's lifetime. Past this the parent watchdog force-fails
// the chip and onFiberRecovered refuses to re-run, so a wedged statement can
// never hang the UI forever.
const MAX_JOB_AGE_MS = 15 * 60_000

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

// Minimal view of the parent LedgerDO we call back into. Declared locally to
// keep this DO decoupled from ledger-do.ts (which already imports this file's
// type — a runtime import cycle would otherwise form).
type ParentStub = {
  onExtractionComplete(statementId: string, text: string): Promise<void>
  onExtractionFailed(statementId: string, error: string): Promise<void>
}

// A durable, single-purpose sub-agent. One DO instance per statement_id
// (`idFromName`). Extraction runs as a managed fiber (`startFiber`): the row
// is persisted before the model call, `keepAlive()` pins the DO for the
// fiber's lifetime so it isn't evicted mid-stream, and if the process does die
// the framework calls `onFiberRecovered` on the next wake to resume. The
// result is persisted first, then pushed to the parent — so a lost push is
// recoverable, and the parent's watchdog re-reads `status()` as a backstop.
export class StatementExtractorDO extends Agent<Cloudflare.Env> {
  private sql2: SqlStorage

  constructor(ctx: AgentContext, env: Cloudflare.Env) {
    super(ctx, env)
    this.sql2 = ctx.storage.sql
    ctx.blockConcurrencyWhile(async () => {
      this.sql2.exec(`CREATE TABLE IF NOT EXISTS job (
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
    this.sql2.exec(
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

  async status(): Promise<JobRow | null> {
    return this.readJob()
  }

  // Accept-and-return-fast. We register a managed fiber and return immediately
  // — the caller (LedgerDO's process_statement tool) is NOT blocked on the
  // model call, so the chat turn ends and the composer frees right away. The
  // fiber's idempotencyKey is the statement_id, so a duplicate call while one
  // is already in flight is a no-op rather than a second extraction. A done
  // job re-delivers from cache without re-running the model.
  async extract(opts: {
    parentName: string
    snapshot: Snapshot
  }): Promise<
    | { accepted: boolean }
    | { ok: false; error: 'not_found' | 'unauthorized' }
  > {
    const job = this.readJob()
    if (!job) {
      console.warn(`[extractor] extract not_found caller=${opts.parentName}`)
      return { ok: false, error: 'not_found' }
    }
    console.log(
      `[extractor] extract id=${job.id} status=${job.status} caller=${opts.parentName}`,
    )
    if (job.owner_email !== opts.parentName) {
      console.warn(
        `[extractor] extract unauthorized id=${job.id} owner=${job.owner_email} caller=${opts.parentName}`,
      )
      return { ok: false, error: 'unauthorized' }
    }
    if (job.status === 'done' && job.result_json !== null) {
      console.log(`[extractor] extract cache-hit id=${job.id}`)
      await this.deliverComplete(opts.parentName, job.id, job.result_json)
      return { accepted: true }
    }
    this.sql2.exec(
      `UPDATE job
         SET parent_name = ?, snapshot_json = ?, status = 'running',
             error = NULL, result_json = NULL, completed_at = NULL
       WHERE id = ?`,
      opts.parentName,
      JSON.stringify(opts.snapshot),
      job.id,
    )
    const result = await this.startFiber(
      'extract',
      (fiber) => this.runExtraction(fiber.signal),
      { idempotencyKey: job.id },
    )
    console.log(
      `[extractor] startFiber id=${job.id} accepted=${result.accepted} fiber=${result.fiberId} status=${result.status}`,
    )
    return { accepted: result.accepted }
  }

  // Re-entered by the framework when the DO is evicted/restarted with this
  // fiber still un-settled. The job's parent_name + snapshot are persisted, so
  // we can resume the model call from scratch. Past MAX_JOB_AGE_MS we give up
  // and fail the job rather than loop forever.
  async onFiberRecovered(ctx: {
    name: string
    createdAt: number
  }): Promise<void> {
    if (ctx.name !== 'extract') return
    const job = this.readJob()
    console.log(
      `[extractor] onFiberRecovered name=${ctx.name} jobStatus=${job?.status ?? 'none'} ageMs=${Date.now() - ctx.createdAt}`,
    )
    if (!job || job.status === 'done' || job.status === 'failed') return
    if (Date.now() - ctx.createdAt > MAX_JOB_AGE_MS) {
      const message = 'extraction abandoned: exceeded max age after restart'
      console.error(`[extractor] recovery-give-up id=${job.id}`)
      this.markFailed(job.id, message)
      if (job.parent_name) {
        await this.deliverFail(job.parent_name, job.id, message)
      }
      return
    }
    console.log(`[extractor] recovering interrupted fiber id=${job.id}`)
    await this.runExtraction(undefined)
  }

  // The actual work, callable from both the initial fiber and recovery. Reads
  // everything it needs from the persisted row so it is self-contained.
  private async runExtraction(signal: AbortSignal | undefined): Promise<void> {
    const job = this.readJob()
    if (!job) return
    const parentName = job.parent_name
    const snapshot = job.snapshot_json
      ? (JSON.parse(job.snapshot_json) as Snapshot)
      : null
    if (!parentName || !snapshot) {
      this.markFailed(job.id, 'missing parent_name or snapshot')
      return
    }
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
      `[extractor] extraction start id=${job.id} filename=${job.filename} bytes=${job.text.length}`,
    )
    let textBuf = ''
    try {
      const timeout = AbortSignal.timeout(EXTRACTION_TIMEOUT_MS)
      const abortSignal = signal
        ? AbortSignal.any([signal, timeout])
        : timeout
      const workersai = createWorkersAI({ binding: this.env.AI })
      const model = workersai(MODEL_ID, {
        // The Workers AI schema key is `thinking`, not `enable_thinking` (the
        // workers-ai-provider TS surface mistranslates it). Default is true,
        // so we must pass false explicitly to skip the reasoning trace.
        chat_template_kwargs: { thinking: false } as never,
      })
      const { fullStream } = streamText({
        model,
        system,
        prompt: job.text,
        abortSignal,
      })
      for await (const part of fullStream) {
        if (part.type === 'text-delta') {
          textBuf += part.text
        } else if (part.type === 'error') {
          throw part.error instanceof Error
            ? part.error
            : new Error(String(part.error))
        }
      }
      this.sql2.exec(
        `UPDATE job SET status='done', result_json=?, error=NULL, completed_at=? WHERE id=?`,
        textBuf,
        Date.now(),
        job.id,
      )
      const elapsedMs = Date.now() - startedAt
      console.log(
        `[extractor] done id=${job.id} elapsedMs=${elapsedMs} textBytes=${textBuf.length} — pushing to parent=${parentName}`,
      )
      await this.deliverComplete(parentName, job.id, textBuf)
    } catch (e) {
      const elapsedMs = Date.now() - startedAt
      const message = e instanceof Error ? e.message : String(e)
      console.error(
        `[extractor] failed id=${job.id} elapsedMs=${elapsedMs}`,
        { err: message },
      )
      this.markFailed(job.id, message)
      await this.deliverFail(parentName, job.id, message)
    }
  }

  private markFailed(id: string, error: string): void {
    this.sql2.exec(
      `UPDATE job SET status='failed', error=?, completed_at=? WHERE id=?`,
      error,
      Date.now(),
      id,
    )
  }

  private getParentStub(parentName: string): ParentStub {
    const ns = this.env.LEDGER_DO
    return ns.get(ns.idFromName(parentName)) as unknown as ParentStub
  }

  private async deliverComplete(
    parentName: string,
    id: string,
    text: string,
  ): Promise<void> {
    try {
      await this.getParentStub(parentName).onExtractionComplete(id, text)
      console.log(`[extractor] push onExtractionComplete ok id=${id}`)
    } catch (e) {
      console.error(`[extractor] onExtractionComplete failed id=${id}`, {
        err: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      })
    }
  }

  private async deliverFail(
    parentName: string,
    id: string,
    error: string,
  ): Promise<void> {
    try {
      await this.getParentStub(parentName).onExtractionFailed(id, error)
      console.log(`[extractor] push onExtractionFailed ok id=${id}`)
    } catch (e) {
      console.error(`[extractor] onExtractionFailed failed id=${id}`, {
        err: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      })
    }
  }

  private readJob(): JobRow | null {
    const rows = this.sql2
      .exec<JobRow>(`SELECT * FROM job LIMIT 1`)
      .toArray()
    return rows[0] ?? null
  }
}
