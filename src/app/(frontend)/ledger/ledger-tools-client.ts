import type { JSONSchema7 } from 'ai'
import type { AgentRow, AgentSearchResult, MergedReader } from '@/lib/ledger-reader/merged'
import type { MapEntry } from '@/lib/ledger-reader/map'
import { validateEntry, type ValidationResult } from '@/lib/beancount/validate-entry'
import type { Proposal } from './propose'

export type ClientToolDeps = {
  merged: MergedReader
  getEntries: () => ReadonlyArray<MapEntry>
  propose: (p: Proposal) => { ok: boolean; reason?: string }
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

const schemaCreate: JSONSchema7 = {
  type: 'object',
  properties: { raw_text: { type: 'string', minLength: 1 } },
  required: ['raw_text'],
  additionalProperties: false,
}

const schemaUpdate: JSONSchema7 = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    raw_text: { type: 'string', minLength: 1 },
  },
  required: ['id', 'raw_text'],
  additionalProperties: false,
}

const schemaDelete: JSONSchema7 = {
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

export function buildClientTools(deps: ClientToolDeps): ClientTools {
  const { merged, getEntries, propose } = deps
  return {
    reply: {
      description:
        'Send a message to the user. Use for ALL user-facing text — confirmations, clarifying questions, one-line summaries after staging. Do NOT emit free-form assistant text; every reply must go through this tool. May be called in the same step as a propose_* to say something about what you just staged.',
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
        "Run MilesVault's beancount validators on a raw entry string without staging it. Returns {ok, errors[]}. Use this to self-check before propose_create / propose_update (both also auto-validate and refuse to stage on error). Checks: parse, balance, expense sign, payee present, amount required, cashback sign/counterpart, cashback needs payment leg.",
      parameters: schemaValidate,
      execute: async (input): Promise<ValidationResult> => {
        const { raw_text } = (input ?? {}) as { raw_text: string }
        return validateEntry(raw_text)
      },
    },
    propose_create: {
      description:
        'Stage a NEW transaction in the editor buffer. raw_text must be a complete beancount entry. Auto-validated — on validation failure, returns {ok:false, errors:[...]} and does NOT stage; fix the errors and retry. Does NOT save.',
      parameters: schemaCreate,
      execute: async (input) => {
        const { raw_text } = (input ?? {}) as { raw_text: string }
        const v = validateEntry(raw_text)
        if (!v.ok) return { ok: false, errors: v.errors }
        return propose({ kind: 'create', raw_text })
      },
    },
    propose_update: {
      description:
        'Stage an edit to an existing transaction in the editor buffer. Pass the id from ledger_search/ledger_get (positive for saved rows, negative for unsaved-create/dirty entries); `editable` must be true. Pass the full replacement raw_text. Auto-validated — on validation failure, returns {ok:false, errors:[...]} and does NOT stage; fix the errors and retry.',
      parameters: schemaUpdate,
      execute: async (input) => {
        const { id, raw_text } = (input ?? {}) as { id: number; raw_text: string }
        const v = validateEntry(raw_text)
        if (!v.ok) return { ok: false, errors: v.errors }
        if (id < 0) {
          const entry = getEntries().find((e) => e.id === id)
          if (!entry) return { ok: false, reason: `id ${id} not found in buffer` }
          return propose({
            kind: 'replace_text',
            old_raw_text: entry.raw_text,
            raw_text,
          })
        }
        const row = await merged.get(id)
        if (!row || 'ok' in row) {
          return { ok: false, reason: `id ${id} not found` }
        }
        if (!row.editable) {
          return { ok: false, reason: row.reason ?? `id ${id} is not editable` }
        }
        return propose({ kind: 'update', id, raw_text })
      },
    },
    propose_delete: {
      description:
        'Stage removal of a transaction from the editor buffer. Pass the id returned by ledger_search/ledger_get (positive = saved, negative = unsaved); `editable` must be true.',
      parameters: schemaDelete,
      execute: async (input) => {
        const { id } = (input ?? {}) as { id: number }
        if (id < 0) {
          const entry = getEntries().find((e) => e.id === id)
          if (!entry) return { ok: false, reason: `id ${id} not found in buffer` }
          return propose({
            kind: 'delete_text',
            old_raw_text: entry.raw_text,
          })
        }
        const row = await merged.get(id)
        if (!row || 'ok' in row) {
          return { ok: false, reason: `id ${id} not found` }
        }
        if (!row.editable) {
          return { ok: false, reason: row.reason ?? `id ${id} is not editable` }
        }
        return propose({ kind: 'delete', id })
      },
    },
  }
}
