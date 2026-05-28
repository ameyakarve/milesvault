// Shared contract between TaskCoordinator (parent agent) and TaskWorker
// (child sub-agent). Both ends live in their own Durable Object; they talk
// over cross-DO RPC. These types are the wire shape of that conversation.

export type TaskJobStatus = 'ready' | 'running' | 'done' | 'failed'

// The worker's persisted job row, returned by status() so the coordinator's
// watchdog can re-read a result the push-back may have dropped. `result_json`
// is the worker's serialized Result (see TaskWorker.serializeResult).
export type TaskJobRow = {
  id: string
  parent_name: string | null
  prepared_json: string | null
  context_json: string | null
  status: TaskJobStatus
  result_json: string | null
  error: string | null
  created_at: number
  completed_at: number | null
}

// The slice of a TaskCoordinator the worker calls back into. Declared here so
// the worker stays decoupled from any concrete coordinator implementation.
export interface TaskParentStub {
  onTaskComplete(taskId: string, resultJson: string): Promise<void>
  onTaskFailed(taskId: string, error: string): Promise<void>
}

// The slice of a TaskWorker the coordinator calls. `dispatch` triggers the
// run; `status` is the watchdog's poll fallback.
export interface TaskWorkerStub<Context> {
  dispatch(opts: {
    parentName: string
    context: Context
  }): Promise<
    { accepted: boolean } | { ok: false; error: 'not_found' | 'unauthorized' }
  >
  status(): Promise<TaskJobRow | null>
}
