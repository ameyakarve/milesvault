import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { LedgerDO } from '@/durable/ledger-do'
import type {
  DirectiveCreateResult,
  DirectiveDeleteResult,
  DirectiveInput,
  DirectiveKind,
  DirectiveListResult,
  DirectiveUpdateResult,
  DirectiveV2,
  TransactionInput,
  TransactionV2,
  V2CreateResult,
  V2DeleteResult,
  V2ListResult,
  V2UpdateResult,
} from '@/durable/ledger-v2-types'
export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 100

export type LedgerClient = {
  v2_create(input: TransactionInput): Promise<V2CreateResult>
  v2_get(id: number): Promise<TransactionV2 | null>
  v2_list(limit?: number, offset?: number): Promise<V2ListResult>
  v2_update(
    id: number,
    expected_updated_at: number,
    input: TransactionInput,
  ): Promise<V2UpdateResult>
  v2_delete(id: number, expected_updated_at: number): Promise<V2DeleteResult>
  v2_directive_create(directives: DirectiveInput[]): Promise<DirectiveCreateResult>
  v2_directive_get(kind: DirectiveKind, id: number): Promise<DirectiveV2 | null>
  v2_directive_list(limit?: number, offset?: number): Promise<DirectiveListResult>
  v2_directive_update(
    kind: DirectiveKind,
    id: number,
    expected_updated_at: number,
    directive: DirectiveInput,
  ): Promise<DirectiveUpdateResult>
  v2_directive_delete(
    kind: DirectiveKind,
    id: number,
    expected_updated_at: number,
  ): Promise<DirectiveDeleteResult>
  v2_account_constraints(account: string): Promise<string[] | null>
  v2_listAccounts(): Promise<string[]>
  v2_recent_accounts_list(limit?: number): Promise<string[]>
  v2_recent_account_touch(account: string): Promise<void>
  v2_list_by_account(account: string, limit?: number, offset?: number): Promise<V2ListResult>
}

const DIRECTIVE_KINDS: readonly DirectiveKind[] = [
  'transaction', 'open', 'close', 'commodity', 'balance',
  'pad', 'price', 'note', 'document', 'event',
]

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

export function createLedgerClient(env: Cloudflare.Env, email: string): LedgerClient {
  const ns = env.LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
  if (!ns) throw new LedgerBindingError()
  const stub = ns.get(ns.idFromName(email))

  return {
    async v2_create(input) {
      assertTransactionInputShape(input)
      return stub.v2_create(input)
    },

    async v2_get(id) {
      assertPositiveInt(id, 'id')
      return stub.v2_get(id)
    },

    async v2_list(limit = DEFAULT_LIMIT, offset = 0) {
      const l = clampInt(limit, 1, MAX_LIMIT, DEFAULT_LIMIT)
      const o = Math.max(0, Number.isFinite(offset) ? Math.floor(offset) : 0)
      return stub.v2_list(l, o)
    },

    async v2_update(id, expected_updated_at, input) {
      assertPositiveInt(id, 'id')
      if (!Number.isInteger(expected_updated_at)) {
        throw new LedgerInputError(['expected_updated_at must be an integer.'])
      }
      assertTransactionInputShape(input)
      return stub.v2_update(id, expected_updated_at, input)
    },

    async v2_delete(id, expected_updated_at) {
      assertPositiveInt(id, 'id')
      if (!Number.isInteger(expected_updated_at)) {
        throw new LedgerInputError(['expected_updated_at must be an integer.'])
      }
      return stub.v2_delete(id, expected_updated_at)
    },

    async v2_directive_create(directives) {
      if (!Array.isArray(directives) || directives.length === 0) {
        throw new LedgerInputError(['directives must be a non-empty array.'])
      }
      return stub.v2_directive_create(directives)
    },

    async v2_directive_get(kind, id) {
      assertDirectiveKind(kind)
      assertPositiveInt(id, 'id')
      return stub.v2_directive_get(kind, id)
    },

    async v2_directive_list(limit = DEFAULT_LIMIT, offset = 0) {
      const l = clampInt(limit, 1, MAX_LIMIT, DEFAULT_LIMIT)
      const o = Math.max(0, Number.isFinite(offset) ? Math.floor(offset) : 0)
      return stub.v2_directive_list(l, o)
    },

    async v2_directive_update(kind, id, expected_updated_at, directive) {
      assertDirectiveKind(kind)
      assertPositiveInt(id, 'id')
      if (!Number.isInteger(expected_updated_at)) {
        throw new LedgerInputError(['expected_updated_at must be an integer.'])
      }
      return stub.v2_directive_update(kind, id, expected_updated_at, directive)
    },

    async v2_directive_delete(kind, id, expected_updated_at) {
      assertDirectiveKind(kind)
      assertPositiveInt(id, 'id')
      if (!Number.isInteger(expected_updated_at)) {
        throw new LedgerInputError(['expected_updated_at must be an integer.'])
      }
      return stub.v2_directive_delete(kind, id, expected_updated_at)
    },

    async v2_account_constraints(account) {
      if (typeof account !== 'string' || account.length === 0) {
        throw new LedgerInputError(['account must be a non-empty string.'])
      }
      return stub.v2_account_constraints(account)
    },

    async v2_listAccounts() {
      return stub.v2_listAccounts()
    },

    async v2_recent_accounts_list(limit = 10) {
      const l = clampInt(limit, 1, MAX_LIMIT, 10)
      return stub.v2_recent_accounts_list(l)
    },

    async v2_recent_account_touch(account) {
      if (typeof account !== 'string' || account.length === 0) {
        throw new LedgerInputError(['account must be a non-empty string.'])
      }
      return stub.v2_recent_account_touch(account)
    },

    async v2_list_by_account(account, limit = DEFAULT_LIMIT, offset = 0) {
      if (typeof account !== 'string' || account.length === 0) {
        throw new LedgerInputError(['account must be a non-empty string.'])
      }
      const l = clampInt(limit, 1, MAX_LIMIT, DEFAULT_LIMIT)
      const o = Math.max(0, Number.isFinite(offset) ? Math.floor(offset) : 0)
      return stub.v2_list_by_account(account, l, o)
    },
  }
}

export async function getLedgerClient(email: string): Promise<LedgerClient> {
  const { env } = await getCloudflareContext({ async: true })
  return createLedgerClient(env as Cloudflare.Env, email)
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

export function assertDirectiveKind(v: unknown): asserts v is DirectiveKind {
  if (typeof v !== 'string' || !(DIRECTIVE_KINDS as readonly string[]).includes(v)) {
    throw new LedgerInputError([`kind must be one of ${DIRECTIVE_KINDS.join('|')} (got '${String(v)}').`])
  }
}

function assertTransactionInputShape(v: unknown): asserts v is TransactionInput {
  if (!v || typeof v !== 'object') {
    throw new LedgerInputError(['input must be an object.'])
  }
  const obj = v as Record<string, unknown>
  if (typeof obj.date !== 'string') {
    throw new LedgerInputError(['input.date must be a string.'])
  }
  if (!Array.isArray(obj.postings)) {
    throw new LedgerInputError(['input.postings must be an array.'])
  }
  for (const [i, p] of (obj.postings as unknown[]).entries()) {
    if (!p || typeof p !== 'object') {
      throw new LedgerInputError([`input.postings[${i}] must be an object.`])
    }
    const po = p as Record<string, unknown>
    if (typeof po.account !== 'string') {
      throw new LedgerInputError([`input.postings[${i}].account must be a string.`])
    }
  }
}
