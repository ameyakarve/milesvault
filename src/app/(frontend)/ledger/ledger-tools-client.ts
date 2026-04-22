import type { JSONSchema7 } from 'ai'
import type { LedgerReader, ReaderRow, SearchResult } from '@/lib/ledger-reader/types'
import {
  validateEntry,
  type ValidationError,
  type ValidationResult,
} from '@/lib/beancount/validate-entry'
import type { Op } from './propose'

export type ClientToolDeps = {
  reader: LedgerReader
  propose: (ops: readonly Op[]) => { ok: boolean; reason?: string }
}

type ToolEntry = {
  description: string
  parameters: JSONSchema7
  execute: (input: unknown) => Promise<unknown>
}

export type ClientTools = Record<string, ToolEntry>

const schemaSearch: JSONSchema7 = {
  type: 'object',
  properties: {
    q: { type: 'string', default: '' },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    offset: { type: 'integer', minimum: 0, default: 0 },
  },
  additionalProperties: false,
}

const schemaGet: JSONSchema7 = {
  type: 'object',
  properties: { id: { type: 'integer' } },
  required: ['id'],
  additionalProperties: false,
}

const schemaValidate: JSONSchema7 = {
  type: 'object',
  properties: { raw_text: { type: 'string', minLength: 1 } },
  required: ['raw_text'],
  additionalProperties: false,
}

const schemaReply: JSONSchema7 = {
  type: 'object',
  properties: { message: { type: 'string', minLength: 1 } },
  required: ['message'],
  additionalProperties: false,
}

const SEARCH_DESCRIPTION = `Search the transactions currently visible in the editor buffer. Scoped to the current page — entries on other pages are not searchable. If the user asks about something older, ask them to page to it first.

Query grammar (tokens combined by whitespace, all ANDed):
  @<seg>              Match any account segment. Segments split on ':' — '@expenses:food' expands to @expenses AND @food.
  #<tag>              Match a tag.
  ^<link>             Match a link.
  >YYYY-MM-DD         Inclusive start date (>YYYY-MM = start of month).
  <YYYY-MM-DD         Inclusive end date (<YYYY-MM = end of month).
  YYYY-MM..YYYY-MM    Closed date range (day variants also work).
  YYYY-MM-DD          Exact day.
  <free word>         Matches any indexed field (payee, account, currency, tag, link). Narration is NOT indexed.

Rules:
- Prefer concrete filters over free text. Use @account for category filters and a single free token for payee. Don't pass filler words ("all", "this", "month", "by") — they either filter to zero or duplicate an @filter.
- To find a specific txn by payee+date (e.g. "the Amudham one from April 19"), combine a tight date range with the payee as a free token: '>2026-04-19 <2026-04-19 amudham'.
- If 0 hits, broaden (drop the date or widen it) before guessing a different merchant name.
- Empty q returns most-recent first.

Examples:
  "find Amudham on 19 April"   -> q: ">2026-04-19 <2026-04-19 amudham"
  "food spend in April 2026"   -> q: ">2026-04-01 <2026-04-30 @expenses:food"
  "travel tag this month"      -> q: ">2026-04-01 <2026-04-30 #travel"`

const schemaPropose: JSONSchema7 = {
  type: 'object',
  properties: {
    ops: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        oneOf: [
          {
            type: 'object',
            properties: {
              op: { const: 'create' },
              raw_text: { type: 'string', minLength: 1 },
            },
            required: ['op', 'raw_text'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              op: { const: 'update' },
              id: { type: 'integer' },
              raw_text: { type: 'string', minLength: 1 },
            },
            required: ['op', 'id', 'raw_text'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              op: { const: 'delete' },
              id: { type: 'integer' },
            },
            required: ['op', 'id'],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  required: ['ops'],
  additionalProperties: false,
}

export function buildClientTools(deps: ClientToolDeps): ClientTools {
  const { reader, propose } = deps
  return {
    reply: {
      description:
        'Send a message to the user. Use for ALL user-facing text — confirmations, clarifying questions, one-line summaries after staging. Do NOT emit free-form assistant text; every reply must go through this tool. May be called in the same step as propose to say something about what you just staged. After this call returns, stop — do not call more tools this turn.',
      parameters: schemaReply,
      execute: async (input) => {
        const { message } = (input ?? {}) as { message: string }
        return {
          ok: true,
          done: true,
          note: 'Message delivered. Turn complete — do NOT call any more tools; wait for the next user message.',
          message,
        }
      },
    },
    ledger_search: {
      description: SEARCH_DESCRIPTION,
      parameters: schemaSearch,
      execute: async (input): Promise<SearchResult> => {
        const { q = '', limit = 20, offset = 0 } = (input ?? {}) as {
          q?: string
          limit?: number
          offset?: number
        }
        return reader.search(q, limit, offset)
      },
    },
    ledger_get: {
      description:
        'Fetch one transaction by id from the current editor buffer. Positive id = saved row currently on this page; negative id = unsaved-create/dirty entry. Returns null if not in the buffer.',
      parameters: schemaGet,
      execute: async (input): Promise<ReaderRow | null> => {
        const { id } = (input ?? {}) as { id: number }
        return reader.get(id)
      },
    },
    validate_entry: {
      description:
        "Run MilesVault's beancount validators on a raw entry string without staging it. Returns {ok, errors[]}. Use this to self-check before propose (which also auto-validates). Checks: parse, balance, expense sign, payee present, amount required, cashback sign/counterpart, cashback needs payment leg.",
      parameters: schemaValidate,
      execute: async (input): Promise<ValidationResult> => {
        const { raw_text } = (input ?? {}) as { raw_text: string }
        return validateEntry(raw_text)
      },
    },
    propose: {
      description:
        "Stage a batch of create/update/delete ops against the editor buffer. All-or-nothing: any validation failure rejects the whole batch and nothing is staged. Call propose AT MOST ONCE per user turn — pack every change the user asked for into one call's `ops` array. Ops apply in order. For update/delete, the id MUST already be present in the buffer (positive = saved row currently on this page; negative = unsaved create/dirty). If the user asks to edit a row on another page, ask them to page to it first.",
      parameters: schemaPropose,
      execute: async (input) => {
        const { ops } = (input ?? {}) as { ops: readonly Op[] }
        const errors: { index: number; errors: ValidationError[] }[] = []
        for (let i = 0; i < ops.length; i++) {
          const op = ops[i]
          if (op.op === 'create' || op.op === 'update') {
            const v = validateEntry(op.raw_text)
            if (!v.ok) errors.push({ index: i, errors: v.errors })
          }
        }
        if (errors.length > 0) return { ok: false, errors }
        const result = propose(ops)
        if (!result.ok) return result
        return {
          ...result,
          done: true,
          note: 'Ops staged. Call `reply` once to confirm, then stop — do NOT call propose or any other tool again this turn.',
        }
      },
    },
  }
}
