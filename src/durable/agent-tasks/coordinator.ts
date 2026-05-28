import { Think } from '@cloudflare/think'
import type { TaskJobRow, TaskWorkerStub } from './types'

type CoordRow = {
  task_id: string
  status: 'pending' | 'done' | 'failed'
  created_at: number
}

// Lifecycle phase reported to the consumer's UI-state hook.
export type TaskPhase = 'dispatched' | 'delivered' | 'failed'

// The parent half of agent-to-agent comms. Extends Think because "delivering a
// result" means waking this agent's loop: the result is appended to the
// conversation and a turn runs so the model reacts to it (e.g. drafts from an
// extracted statement). That delivery is the whole point of the abstraction.
//
// What this base owns — the parts every consumer would otherwise re-derive and
// get subtly wrong:
//   - dispatch: record the task, kick the worker, arm the watchdog
//   - exactly-once delivery: deliver FIRST, mark terminal only after the turn
//     persists, so an eviction mid-delivery leaves the task redeliverable
//   - an in-memory `_delivering` guard to dedupe the worker-push vs watchdog race
//   - reconcileTasks: a self-cancelling watchdog that re-reads worker status()
//     and redelivers/force-fails anything the push dropped
//
// It keeps its OWN durable ledger (agent_task_coord) of in-flight tasks, kept
// deliberately separate from any UI state — the consumer's display state is
// updated only through the onTaskPhase hook, so this base never touches the
// frontend contract.
//
// Generic over the produced Result. Subclasses provide the worker namespace,
// the delivery framing, result deserialization, and (optionally) a UI hook.
export abstract class TaskCoordinator<
  Env extends Cloudflare.Env,
  State,
  Result,
> extends Think<Env, State> {
  // task_ids whose delivery turn is in flight in THIS instance. The worker's
  // push and the reconcile watchdog can both observe a task as pending and
  // race to deliver; this dedupes them within an instance. Intentionally not
  // persisted — after a crash the ledger row is still 'pending' (we mark
  // 'done' only after delivery), so reconcile re-delivers the interrupted run.
  private _delivering = new Set<string>()
  private _coordReady = false

  protected reconcileIntervalS = 120
  protected taskMaxAgeMs = 16 * 60_000
  protected logTag = '[task]'
  // Must match the method name below — scheduleEvery dispatches by name.
  private readonly reconcileCallback = 'reconcileTasks'

  // ---- Subclass contract ----

  protected abstract taskWorkerNamespace(): DurableObjectNamespace
  // SQLite handle for this DO. Returned by the consumer (which already has one).
  protected abstract taskCoordSql(): SqlStorage
  protected abstract deserializeResult(resultJson: string): Result
  // The message injected into the conversation on success/failure. The turn
  // that runs lets the model act on it.
  protected abstract buildTaskDeliveryMessage(
    taskId: string,
    result: Result,
  ): string
  protected abstract buildTaskFailureMessage(
    taskId: string,
    error: string,
  ): string
  // Optional: reflect lifecycle into the consumer's own UI state. Default no-op.
  protected onTaskPhase(
    _taskId: string,
    _phase: TaskPhase,
    _error?: string,
  ): void | Promise<void> {}

  // ---- Dispatch ----

  // Record the task as in-flight, kick the worker (which must already be
  // prepared), and arm the watchdog. Returns the worker's accept result.
  async dispatchTask(
    taskId: string,
    context: unknown,
  ): Promise<
    { accepted: boolean } | { ok: false; error: 'not_found' | 'unauthorized' }
  > {
    this.ensureCoordTable()
    this.taskCoordSql().exec(
      `INSERT OR REPLACE INTO agent_task_coord (task_id, status, created_at) VALUES (?, 'pending', ?)`,
      taskId,
      Date.now(),
    )
    await this.onTaskPhase(taskId, 'dispatched')
    const ns = this.taskWorkerNamespace()
    const stub = ns.get(
      ns.idFromName(taskId),
    ) as unknown as TaskWorkerStub<unknown>
    let r: Awaited<ReturnType<TaskWorkerStub<unknown>['dispatch']>>
    try {
      r = await stub.dispatch({ parentName: this.name, context })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.setCoordStatus(taskId, 'failed')
      await this.onTaskPhase(taskId, 'failed', msg)
      return { ok: false, error: 'not_found' }
    }
    if ('error' in r) {
      this.setCoordStatus(taskId, 'failed')
      await this.onTaskPhase(taskId, 'failed', r.error)
      return r
    }
    // scheduleEvery is idempotent — one interval regardless of how many tasks
    // are in flight; reconcileTasks cancels it when none remain. Pass {} so
    // the dispatcher's JSON.parse(payload) round-trips (an undefined payload
    // can wedge the callback).
    await this.scheduleEvery(this.reconcileIntervalS, this.reconcileCallback, {})
    console.log(
      `${this.logTag} dispatchTask armed watchdog id=${taskId} interval=${this.reconcileIntervalS}s`,
    )
    return r
  }

  // ---- Push-back RPC (called by the worker) ----

  async onTaskComplete(taskId: string, resultJson: string): Promise<void> {
    this.ensureCoordTable()
    const row = this.coordRow(taskId)
    console.log(
      `${this.logTag} onTaskComplete id=${taskId} coord=${row?.status ?? 'none'}`,
    )
    if (row && row.status !== 'pending') {
      console.log(`${this.logTag} onTaskComplete skip (already ${row.status}) id=${taskId}`)
      return
    }
    if (this._delivering.has(taskId)) {
      console.log(`${this.logTag} onTaskComplete skip (delivering) id=${taskId}`)
      return
    }
    this._delivering.add(taskId)
    try {
      const result = this.deserializeResult(resultJson)
      const body = this.buildTaskDeliveryMessage(taskId, result)
      // Deliver FIRST. If the DO is evicted before this turn persists, the
      // coord row stays 'pending' and the watchdog redelivers; marking 'done'
      // first would leave the task terminal with the turn never run.
      await this.saveMessages([
        {
          id: crypto.randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: body }],
        },
      ])
      this.setCoordStatus(taskId, 'done')
      await this.onTaskPhase(taskId, 'delivered')
      console.log(`${this.logTag} onTaskComplete delivered id=${taskId} (turn ran inline)`)
    } finally {
      this._delivering.delete(taskId)
    }
  }

  async onTaskFailed(taskId: string, error: string): Promise<void> {
    this.ensureCoordTable()
    const row = this.coordRow(taskId)
    console.log(
      `${this.logTag} onTaskFailed id=${taskId} coord=${row?.status ?? 'none'} error=${error}`,
    )
    if (row && row.status !== 'pending') {
      console.log(`${this.logTag} onTaskFailed skip (already ${row.status}) id=${taskId}`)
      return
    }
    if (this._delivering.has(taskId)) {
      console.log(`${this.logTag} onTaskFailed skip (delivering) id=${taskId}`)
      return
    }
    this._delivering.add(taskId)
    try {
      const body = this.buildTaskFailureMessage(taskId, error)
      await this.saveMessages([
        {
          id: crypto.randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: body }],
        },
      ])
      this.setCoordStatus(taskId, 'failed')
      await this.onTaskPhase(taskId, 'failed', error)
    } finally {
      this._delivering.delete(taskId)
    }
  }

  // ---- Watchdog ----

  // Periodic backstop. Re-reads each in-flight task's worker status() and
  // delivers the result the push may have dropped, force-failing anything past
  // taskMaxAgeMs. Self-cancels the interval once nothing is pending.
  async reconcileTasks(): Promise<void> {
    this.ensureCoordTable()
    const ns = this.taskWorkerNamespace()
    const pending = this.taskCoordSql()
      .exec<CoordRow>(`SELECT * FROM agent_task_coord WHERE status='pending'`)
      .toArray()
    console.log(
      `${this.logTag} reconcile tick: ${pending.length} pending [${pending.map((r) => r.task_id).join(',')}]`,
    )
    for (const row of pending) {
      let job: TaskJobRow | null = null
      try {
        const stub = ns.get(
          ns.idFromName(row.task_id),
        ) as unknown as TaskWorkerStub<unknown>
        job = await stub.status()
      } catch (e) {
        console.error(`${this.logTag} reconcile status() failed id=${row.task_id}`, {
          err: e instanceof Error ? e.message : String(e),
        })
        continue
      }
      if (!job) {
        await this.onTaskFailed(row.task_id, 'worker job not found')
        continue
      }
      const ageMs = Date.now() - job.created_at
      console.log(
        `${this.logTag} reconcile job id=${row.task_id} status=${job.status} hasResult=${job.result_json !== null} ageMs=${ageMs}`,
      )
      if (job.status === 'done' && job.result_json !== null) {
        await this.onTaskComplete(row.task_id, job.result_json)
      } else if (job.status === 'failed') {
        await this.onTaskFailed(row.task_id, job.error ?? 'unknown error')
      } else if (ageMs > this.taskMaxAgeMs) {
        console.warn(`${this.logTag} reconcile force-fail (stale) id=${row.task_id}`)
        await this.onTaskFailed(row.task_id, 'task timed out (watchdog)')
      }
    }
    const stillPending =
      (
        this.taskCoordSql()
          .exec<{ c: number }>(
            `SELECT COUNT(*) AS c FROM agent_task_coord WHERE status='pending'`,
          )
          .toArray()[0]?.c ?? 0
      ) > 0
    if (!stillPending) {
      const schedules = await this.listSchedules({ type: 'interval' })
      for (const s of schedules) {
        if (s.callback === this.reconcileCallback) {
          await this.cancelSchedule(s.id)
          console.log(`${this.logTag} reconcile idle — cancelled watchdog ${s.id}`)
        }
      }
    }
  }

  // ---- Internals ----

  private ensureCoordTable(): void {
    if (this._coordReady) return
    this.taskCoordSql().exec(`CREATE TABLE IF NOT EXISTS agent_task_coord (
      task_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`)
    this._coordReady = true
  }

  private coordRow(taskId: string): CoordRow | null {
    return (
      this.taskCoordSql()
        .exec<CoordRow>(`SELECT * FROM agent_task_coord WHERE task_id=?`, taskId)
        .toArray()[0] ?? null
    )
  }

  private setCoordStatus(taskId: string, status: CoordRow['status']): void {
    this.taskCoordSql().exec(
      `UPDATE agent_task_coord SET status=? WHERE task_id=?`,
      status,
      taskId,
    )
  }
}
