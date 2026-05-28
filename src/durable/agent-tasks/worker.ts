import { Agent, type AgentContext } from 'agents'
import type { TaskJobRow, TaskParentStub } from './types'

// A durable, single-purpose sub-agent base. One DO instance per task id
// (`idFromName`). The lifecycle is two-phase:
//
//   prepare(id, prepared)  — pre-stage a payload (e.g. an uploaded document)
//                            before anyone decides to act on it.
//   dispatch({ parentName, context })
//                          — trigger the run with runtime context, naming the
//                            coordinator to push the result back to.
//
// The work runs as a managed fiber (`startFiber`): the row is persisted before
// the model/IO call, the framework keeps the DO alive for the fiber's
// lifetime, and if the process dies mid-run it calls `onFiberRecovered` on the
// next wake to resume. The result is persisted FIRST, then pushed to the
// parent — so a lost push is recoverable, and the coordinator's watchdog
// re-reads `status()` as a backstop.
//
// Generic over the pre-staged payload (Prepared), the dispatch-time context
// (Context), and the produced Result. Subclasses implement `runTask`.
export abstract class TaskWorker<
  Env extends Cloudflare.Env,
  Prepared,
  Context,
  Result,
> extends Agent<Env> {
  protected taskSql: SqlStorage

  // Hard ceiling on a job's lifetime. Past this the coordinator's watchdog
  // force-fails the task and onFiberRecovered refuses to re-run, so a wedged
  // job can never hang forever. Override per worker if needed.
  protected maxJobAgeMs = 15 * 60_000
  // Fiber name + log tag — override so logs are greppable per worker kind.
  protected fiberName = 'task'
  protected logTag = '[task]'

  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env)
    this.taskSql = ctx.storage.sql
    ctx.blockConcurrencyWhile(async () => {
      this.taskSql.exec(`CREATE TABLE IF NOT EXISTS agent_task_job (
        id TEXT PRIMARY KEY,
        parent_name TEXT,
        prepared_json TEXT,
        context_json TEXT,
        status TEXT NOT NULL,
        result_json TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      )`)
    })
  }

  // ---- Subclass contract ----

  // The actual work. Self-contained: receives everything from the persisted
  // row, so it is callable from both the initial fiber and recovery. `signal`
  // is the fiber's abort signal (undefined on recovery).
  protected abstract runTask(
    prepared: Prepared,
    context: Context,
    signal: AbortSignal | undefined,
  ): Promise<Result>

  // The DurableObjectNamespace of the coordinator to push results back to.
  protected abstract parentNamespace(): DurableObjectNamespace

  // Optional gate run at dispatch (e.g. owner check). Default: allow.
  protected authorizeDispatch(
    _prepared: Prepared | null,
    _parentName: string,
  ): boolean {
    return true
  }

  // How to (de)serialize Result for the job row / push-back. Default is JSON;
  // override with identity when Result is already a string.
  protected serializeResult(result: Result): string {
    return JSON.stringify(result)
  }

  // ---- Public RPC surface ----

  // Pre-stage a payload. Idempotent: a second prepare on the same DO is a
  // no-op error rather than clobbering an in-flight job.
  async prepare(
    id: string,
    prepared: Prepared,
  ): Promise<{ ok: true } | { ok: false; error: 'already_prepared' }> {
    if (this.readJob()) return { ok: false, error: 'already_prepared' }
    this.taskSql.exec(
      `INSERT INTO agent_task_job (id, prepared_json, status, created_at)
       VALUES (?, ?, 'ready', ?)`,
      id,
      JSON.stringify(prepared),
      Date.now(),
    )
    return { ok: true }
  }

  // Accept-and-return-fast. Registers a managed fiber and returns immediately
  // so the caller's request/turn ends without blocking on the run. The fiber's
  // idempotencyKey is the task id, so a duplicate dispatch while one is in
  // flight is a no-op. A done job re-delivers from cache without re-running.
  async dispatch(opts: {
    parentName: string
    context: Context
  }): Promise<
    { accepted: boolean } | { ok: false; error: 'not_found' | 'unauthorized' }
  > {
    const job = this.readJob()
    if (!job) {
      console.warn(`${this.logTag} dispatch not_found caller=${opts.parentName}`)
      return { ok: false, error: 'not_found' }
    }
    const prepared = job.prepared_json
      ? (JSON.parse(job.prepared_json) as Prepared)
      : null
    console.log(
      `${this.logTag} dispatch id=${job.id} status=${job.status} caller=${opts.parentName}`,
    )
    if (!this.authorizeDispatch(prepared, opts.parentName)) {
      console.warn(`${this.logTag} dispatch unauthorized id=${job.id}`)
      return { ok: false, error: 'unauthorized' }
    }
    if (job.status === 'done' && job.result_json !== null) {
      console.log(`${this.logTag} dispatch cache-hit id=${job.id}`)
      await this.pushComplete(opts.parentName, job.id, job.result_json)
      return { accepted: true }
    }
    this.taskSql.exec(
      `UPDATE agent_task_job
         SET parent_name = ?, context_json = ?, status = 'running',
             error = NULL, result_json = NULL, completed_at = NULL
       WHERE id = ?`,
      opts.parentName,
      JSON.stringify(opts.context),
      job.id,
    )
    const r = await this.startFiber(
      this.fiberName,
      (fiber) => this.run(fiber.signal),
      { idempotencyKey: job.id },
    )
    console.log(
      `${this.logTag} startFiber id=${job.id} accepted=${r.accepted} fiber=${r.fiberId} status=${r.status}`,
    )
    return { accepted: r.accepted }
  }

  async status(): Promise<TaskJobRow | null> {
    return this.readJob()
  }

  // Re-entered by the framework when the DO is evicted/restarted with this
  // fiber still un-settled. The row holds parent_name + context, so we resume
  // from scratch. Past maxJobAgeMs we give up and fail rather than loop.
  async onFiberRecovered(ctx: {
    name: string
    createdAt: number
  }): Promise<void> {
    if (ctx.name !== this.fiberName) return
    const job = this.readJob()
    console.log(
      `${this.logTag} onFiberRecovered jobStatus=${job?.status ?? 'none'} ageMs=${Date.now() - ctx.createdAt}`,
    )
    if (!job || job.status === 'done' || job.status === 'failed') return
    if (Date.now() - ctx.createdAt > this.maxJobAgeMs) {
      const message = 'task abandoned: exceeded max age after restart'
      console.error(`${this.logTag} recovery-give-up id=${job.id}`)
      this.markFailed(job.id, message)
      if (job.parent_name) await this.pushFail(job.parent_name, job.id, message)
      return
    }
    console.log(`${this.logTag} recovering interrupted fiber id=${job.id}`)
    await this.run(undefined)
  }

  // ---- Internals ----

  private async run(signal: AbortSignal | undefined): Promise<void> {
    const job = this.readJob()
    if (!job) return
    const parentName = job.parent_name
    const prepared = job.prepared_json
      ? (JSON.parse(job.prepared_json) as Prepared)
      : null
    const context = job.context_json
      ? (JSON.parse(job.context_json) as Context)
      : null
    if (!parentName || prepared === null || context === null) {
      this.markFailed(job.id, 'missing parent_name, prepared, or context')
      return
    }
    try {
      const result = await this.runTask(prepared, context, signal)
      const resultJson = this.serializeResult(result)
      this.taskSql.exec(
        `UPDATE agent_task_job SET status='done', result_json=?, error=NULL, completed_at=? WHERE id=?`,
        resultJson,
        Date.now(),
        job.id,
      )
      console.log(`${this.logTag} done id=${job.id} — pushing to parent=${parentName}`)
      await this.pushComplete(parentName, job.id, resultJson)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error(`${this.logTag} failed id=${job.id}`, { err: message })
      this.markFailed(job.id, message)
      await this.pushFail(parentName, job.id, message)
    }
  }

  private markFailed(id: string, error: string): void {
    this.taskSql.exec(
      `UPDATE agent_task_job SET status='failed', error=?, completed_at=? WHERE id=?`,
      error,
      Date.now(),
      id,
    )
  }

  private parentStub(parentName: string): TaskParentStub {
    const ns = this.parentNamespace()
    return ns.get(ns.idFromName(parentName)) as unknown as TaskParentStub
  }

  private async pushComplete(
    parentName: string,
    id: string,
    resultJson: string,
  ): Promise<void> {
    try {
      await this.parentStub(parentName).onTaskComplete(id, resultJson)
      console.log(`${this.logTag} push onTaskComplete ok id=${id}`)
    } catch (e) {
      console.error(`${this.logTag} push onTaskComplete failed id=${id}`, {
        err: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      })
    }
  }

  private async pushFail(
    parentName: string,
    id: string,
    error: string,
  ): Promise<void> {
    try {
      await this.parentStub(parentName).onTaskFailed(id, error)
      console.log(`${this.logTag} push onTaskFailed ok id=${id}`)
    } catch (e) {
      console.error(`${this.logTag} push onTaskFailed failed id=${id}`, {
        err: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      })
    }
  }

  protected readJob(): TaskJobRow | null {
    return (
      this.taskSql.exec<TaskJobRow>(`SELECT * FROM agent_task_job LIMIT 1`).toArray()[0] ??
      null
    )
  }
}
