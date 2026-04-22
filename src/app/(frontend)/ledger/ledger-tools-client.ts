import type { JSONSchema7 } from 'ai'
import type { AgentRow, AgentSearchResult, MergedReader } from '@/lib/ledger-reader/merged'
import {
  validateEntry,
  type ValidationError,
  type ValidationResult,
} from '@/lib/beancount/validate-entry'
import type { Op } from './propose'

export type ClientToolDeps = {
  merged: MergedReader
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
  const { merged, propose } = deps
  return {
    reply: {
      description:
        'Send a message to the user. Use for ALL user-facing text — confirmations, clarifying questions, one-line summaries after staging. Do NOT emit free-form assistant text; every reply must go through this tool. May be called in the same step as propose to say something about what you just staged.',
      parameters: schemaReply,
      execute: async (input) => {
        const { message } = (input ?? {}) as { message: string }
        return { ok: true, message }
      },
    },
    ledger_search: {
      description:
        "Search the user's transactions. Merges local (viewport + unsaved edits) and server. Each row has `editable` — if false, `reason` tells you whether to ask the user to save or to widen the editor filter. Grammar: @account, #tag, ^link, >YYYY-MM-DD, <YYYY-MM-DD, free tokens.",
      parameters: schemaSearch,
      execute: async (input): Promise<AgentSearchResult> => {
        const { q = '', limit = 20, offset = 0 } = (input ?? {}) as {
          q?: string
          limit?: number
          offset?: number
        }
        return merged.search(q, limit, offset)
      },
    },
    ledger_get: {
      description:
        'Fetch one transaction by id. Positive id = saved row; negative id = unsaved-create/dirty entry in the buffer. Returns `editable` + `reason` like ledger_search.',
      parameters: schemaGet,
      execute: async (
        input,
      ): Promise<AgentRow | { ok: false; reason: string } | null> => {
        const { id } = (input ?? {}) as { id: number }
        return merged.get(id)
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
        "Stage a batch of create/update/delete ops against the editor buffer. All-or-nothing: any validation failure rejects the whole batch and nothing is staged. Call propose AT MOST ONCE per user turn — pack every change the user asked for into one call's `ops` array. Ops apply in order. For update/delete, the id MUST already be present in the buffer (positive = saved row loaded in the viewport; negative = unsaved create/dirty). If the row is on the server but not in the buffer, ledger_search will return it with editable:false — ask the user to save/widen the filter before editing it.",
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
        return propose(ops)
      },
    },
  }
}
