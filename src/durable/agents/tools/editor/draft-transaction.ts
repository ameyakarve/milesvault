import { dynamicTool, jsonSchema, type ToolExecuteFunction } from 'ai'
import { draftTransactionBatchSchema } from '../../../agent-ui-schemas'
import { classifyDraftEntry } from '@/lib/beancount/validate-draft-batch'
import { entryFeedback } from '@/lib/beancount/draft-feedback'

// CLIENT tool — no runtime `execute`, the SDK loop suspends after the call
// until the UI resolves it via addToolResult (approve / reject). Registered
// with `dynamicTool` (not `tool`) on purpose: the AI SDK silently drops
// invalid input for static client tools, but surfaces a `tool-error` to the
// model for dynamic ones — so a bad batch bounces and the model re-emits in the
// same turn, without an empty approval card cluttering history.
//
// `dynamicTool`'s TypeScript signature requires `execute`, but the runtime
// (executeToolCall: `if (tool?.execute == null) return void 0`) short-circuits
// on a literally-undefined execute. We provide `undefined` cast to the expected
// type to keep the suspending behavior while satisfying the compiler.
const SUSPENDING_EXECUTE = undefined as unknown as ToolExecuteFunction<unknown, unknown>

// Shared beancount-shape guidance — what ONE entry's text may be. Identical for
// both surfaces; only the CONTAINER differs.
const ENTRY_SHAPES =
  'Each entry is ONE beancount entry — ONE of:\n' +
  '• a transaction — a date header then 2+ posting lines:\n' +
  '    2026-05-21 * "Payee" "Narration"\n' +
  '      Expenses:Food:Groceries     42.10 USD\n' +
  '      Assets:Bank:Chase:Checking -42.10 USD\n' +
  '• a balance assertion: `2026-06-12 balance Assets:Bank:Chase:Checking  100.00 USD`\n' +
  '• a pad+balance (lets a pad absorb drift up to the figure) — two lines, plug always Equity:Void:\n' +
  '    2026-06-12 pad Assets:Bank:Chase:Checking Equity:Void\n' +
  '    2026-06-12 balance Assets:Bank:Chase:Checking  100.00 USD\n' +
  'Every posting needs an explicit amount and currency (no blanks), and postings must balance per currency. For a foreign-currency or points→points conversion, carry a total price with `@@` in the OTHER commodity (e.g. a 150→150 points transfer: `Assets:Rewards:...:Dest 150 DEST @@ 150 SRC`). On validation failure you get a compact tool-result naming the bad entries with a worked example — fix only those and call again in the same turn. Do NOT narrate, do NOT invent file paths.'

type EntriesMap = { entries: Record<string, string> }

// Validate `{ entries: { id: text } }` the SAME way replaceBuffer validates at the
// journal boundary (classifyDraftEntry per value), surfacing example-rich feedback
// the model can act on. The `entries` WRAPPER matches the shape gemma actually
// emits (it won't drop it); the map inside (id→text) is far fewer JSON strings
// than the editor's array-of-objects. Returns the trimmed map on success, an
// aggregated error on failure (the SDK turns it into a tool-error → re-emit).
function validateEntryMap(
  value: unknown,
): { success: true; value: EntriesMap } | { success: false; error: Error } {
  const ex = '{ "entries": { "t1": "<beancount entry text>", "t2": "…" } }'
  const map = (value as { entries?: unknown } | null)?.entries
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    return { success: false, error: new Error(`Pass ${ex} — an object whose "entries" maps a short id to ONE beancount entry's text.`) }
  }
  const ids = Object.keys(map as Record<string, unknown>)
  if (ids.length === 0) return { success: false, error: new Error(`Provide at least one entry: ${ex}`) }
  const issues: string[] = []
  const out: Record<string, string> = {}
  for (const [id, raw] of Object.entries(map as Record<string, unknown>)) {
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (!text) {
      issues.push(`entry "${id}": empty — each value must be ONE beancount entry's text`)
      continue
    }
    out[id] = text
    const verdict = classifyDraftEntry(text, `entry "${id}"`)
    if (verdict.kind === 'ok') continue
    for (const message of verdict.messages) issues.push(entryFeedback(text, message))
  }
  if (issues.length) return { success: false, error: new Error(issues.join('\n')) }
  return { success: true, value: { entries: out } }
}

// TWO draft-transaction tools, picked by the output channel (`opts.record`):
//
//   - default (SUSPENDING): the EDITOR's client tool. Array-of-objects schema
//     `{ entries: [{ id, text?, replaces? }] }` — it must express ADD / EDIT /
//     DELETE (replaces addresses an existing entry), resolved by the UI on
//     approval. Unchanged.
//
//   - `opts.record` (RECORDING): the headless statement-ingest tool. A first
//     draft is ADDS-ONLY, so no `replaces`. It takes an id→text MAP
//     `{ "t1": "<entry>", … }` — half the JSON strings of the array-of-objects
//     (gemma <|"|>-encodes every key AND value). NOTE on shape: gemma will NOT
//     drop the `entries` wrapper (strong prior from the editor's array tool), so
//     the schema is `{ entries: { <id>: <text> } }` — the wrapper it emits, with
//     a MAP inside instead of array-of-objects. Declared via `jsonSchema()` (not
//     Zod): Zod-4's `z.record(...)` mis-converts to `additionalProperties:false`
//     (drops the value type), sending the model an impossible schema. Validation
//     runs in the `validate` hook so invalid entries still bounce.
//
// BOTH are `dynamicTool` so invalid/garbled args bounce a tool-error and the
// model re-emits in the same turn.
export function draftTransactionTool(opts?: { record?: (entryTexts: string[]) => void }) {
  const record = opts?.record
  if (record) {
    return dynamicTool({
      description:
        'Render the proposed journal entries for the user to review and approve. Call with { "entries": { "t1": "<entry>", "t2": "<entry>" } } — an object whose `entries` maps a short unique id (e.g. "t1", "t2") to ONE entry\'s beancount text. The id is a transient handle (used only to name an entry in validation feedback; never written to the ledger). Put EVERY entry from the statement in `entries` — the transaction rows AND any pad+balance closing bookends. ' +
        ENTRY_SHAPES,
      inputSchema: jsonSchema<EntriesMap>(
        {
          type: 'object',
          properties: {
            entries: { type: 'object', additionalProperties: { type: 'string' }, minProperties: 1 },
          },
          required: ['entries'],
          additionalProperties: false,
        },
        { validate: validateEntryMap },
      ),
      execute: async (input) => {
        const texts = Object.values((input as EntriesMap | undefined)?.entries ?? {})
          .map((t) => String(t ?? '').trim())
          .filter(Boolean)
        record(texts)
        return { ok: true as const, recorded: texts.length }
      },
    })
  }
  return dynamicTool({
    description:
      'Render proposed journal entries for the user to review and approve — to ADD, EDIT, or DELETE. `entries` is an array; each element is { "id", "text"?, "replaces"? }. `id` is a short unique handle (used only to address the entry on a correction — never written to the ledger). ADD = `text` only. EDIT = `replaces` (the existing entry\'s exact text) + `text` (the full replacement). DELETE = `replaces` with empty `text`. For any change to existing entries, call `incorporate({ intent })` first and pass its returned entries here VERBATIM — do not hand-write edits or hunt for entries. ' +
      ENTRY_SHAPES.replace('Each entry is', 'Each `text` is') +
      ' Batch related entries (statement uploads, splits, subscription series) into one call.',
    inputSchema: draftTransactionBatchSchema,
    execute: SUSPENDING_EXECUTE,
  })
}
