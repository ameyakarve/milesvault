import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LedgerDO } from '@/durable/ledger-do'
import {
  toTransaction,
  type BatchApplyInput,
  type BatchConflict,
  type BatchValidationError,
  type Transaction,
} from '@/durable/ledger-types'
import { parseQuery } from '@/durable/search-parser'

export const MAX_RAW_TEXT_BYTES = 4096
export const MAX_QUERY_LENGTH = 1024
export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 100
export const MAX_CREATE_BATCH = 100
export const MAX_APPLY_ITEMS = 50

export type SearchResult = {
  rows: Transaction[]
  total: number
  limit: number
  offset: number
}

export type CreateResult =
  | { ok: true; transaction: Transaction }
  | { ok: false; errors: string[] }

export type CreateBatchResult =
  | { ok: true; transactions: Transaction[] }
  | { ok: false; errors: { index: number; errors: string[] }[] }

export type ApplyBatchResult =
  | { ok: true; updated: Transaction[]; created: Transaction[]; deleted: number[] }
  | { ok: false; kind: 'validation'; errors: BatchValidationError[] }
  | { ok: false; kind: 'conflict'; conflicts: BatchConflict[] }

export type LedgerClient = {
  search(q: string, limit?: number, offset?: number): Promise<SearchResult>
  get(id: number): Promise<Transaction | null>
  create(rawText: string): Promise<CreateResult>
  createBatch(rawTexts: string[]): Promise<CreateBatchResult>
  remove(id: number): Promise<boolean>
  applyBatch(input: BatchApplyInput): Promise<ApplyBatchResult>
}

export class LedgerInputError extends Error {
  constructor(
    public readonly errors: string[],
    message?: string,
  ) {
    super(message ?? errors.join('; '))
    this.name = 'LedgerInputError'
  }
}

export class LedgerBindingError extends Error {
  constructor() {
    super('LEDGER_DO binding missing')
    this.name = 'LedgerBindingError'
  }
}

export async function getLedgerClient(email: string): Promise<LedgerClient> {
  const { env } = await getCloudflareContext({ async: true })
  const ns = env.LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
  if (!ns) throw new LedgerBindingError()
  const stub = ns.get(ns.idFromName(email))

  return {
    async search(q, limit = DEFAULT_LIMIT, offset = 0) {
      if (q.length > MAX_QUERY_LENGTH) {
        throw new LedgerInputError([`q exceeds ${MAX_QUERY_LENGTH} chars.`])
      }
      const l = clampInt(limit, 1, MAX_LIMIT, DEFAULT_LIMIT)
      const o = Math.max(0, Number.isFinite(offset) ? Math.floor(offset) : 0)
      const filter = parseQuery(q)
      const result = await stub.search(filter, l, o)
      return {
        rows: result.rows.map(toTransaction),
        total: result.total,
        limit: l,
        offset: o,
      }
    },

    async get(id) {
      assertPositiveInt(id, 'id')
      const row = await stub.get(id)
      return row ? toTransaction(row) : null
    },

    async create(rawText) {
      assertRawText(rawText, 'raw_text')
      const result = await stub.create(rawText)
      if ('row' in result) return { ok: true, transaction: toTransaction(result.row) }
      return { ok: false, errors: result.errors }
    },

    async createBatch(rawTexts) {
      if (!Array.isArray(rawTexts) || rawTexts.length === 0) {
        throw new LedgerInputError(['items must be a non-empty array.'])
      }
      if (rawTexts.length > MAX_CREATE_BATCH) {
        throw new LedgerInputError([`items exceeds max of ${MAX_CREATE_BATCH}.`])
      }
      for (let i = 0; i < rawTexts.length; i++) {
        assertRawText(rawTexts[i], `items[${i}]`)
      }
      const result = await stub.createBatch(rawTexts)
      if ('rows' in result) return { ok: true, transactions: result.rows.map(toTransaction) }
      return { ok: false, errors: result.errors }
    },

    async remove(id) {
      assertPositiveInt(id, 'id')
      return stub.remove(id)
    },

    async applyBatch(input) {
      const total =
        (input.updates?.length ?? 0) + (input.creates?.length ?? 0) + (input.deletes?.length ?? 0)
      if (total === 0) {
        throw new LedgerInputError(['At least one of updates/creates/deletes must be non-empty.'])
      }
      if (total > MAX_APPLY_ITEMS) {
        throw new LedgerInputError([`Total items exceeds max of ${MAX_APPLY_ITEMS}.`])
      }
      for (const [idx, u] of (input.updates ?? []).entries()) {
        assertRawText(u.raw_text, `updates[${idx}].raw_text`)
      }
      for (const [idx, c] of (input.creates ?? []).entries()) {
        assertRawText(c.raw_text, `creates[${idx}].raw_text`)
      }
      const result = await stub.applyBatch(input)
      if (result.ok) {
        return {
          ok: true,
          updated: result.updated.map(toTransaction),
          created: result.created.map(toTransaction),
          deleted: result.deleted,
        }
      }
      return result
    },
  }
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.floor(n), min), max)
}

function assertPositiveInt(n: number, field: string): void {
  if (!Number.isInteger(n) || n <= 0) {
    throw new LedgerInputError([`${field} must be a positive integer.`])
  }
}

function assertRawText(v: unknown, field: string): asserts v is string {
  if (typeof v !== 'string') {
    throw new LedgerInputError([`${field} must be a string.`])
  }
  if (new TextEncoder().encode(v).byteLength > MAX_RAW_TEXT_BYTES) {
    throw new LedgerInputError([`${field} exceeds ${MAX_RAW_TEXT_BYTES} bytes.`])
  }
}
