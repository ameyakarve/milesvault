import { getCloudflareContext } from '@opennextjs/cloudflare'
import type {
  JournalGetResponse,
  JournalPutError,
  JournalPutResponse,
  LedgerDO,
} from '@/durable/ledger-do'
import type { AccountEntriesResponse } from '@/durable/ledger-types'
export const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export type LedgerClient = {
  recent_accounts_list(limit?: number): Promise<string[]>
  recent_account_touch(account: string): Promise<void>
  list_account_entries(
    account: string,
    limit?: number,
    offset?: number,
  ): Promise<AccountEntriesResponse>
  journal_get(): Promise<JournalGetResponse>
  journal_put(text: string): Promise<JournalPutResponse | JournalPutError>
  clear(): Promise<{ ok: true }>
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
  const ns = (env as Cloudflare.Env).LEDGER_DO as DurableObjectNamespace<LedgerDO> | undefined
  if (!ns) throw new LedgerBindingError()
  const stub = ns.get(ns.idFromName(email))

  return {
    async recent_accounts_list(limit = 10) {
      return stub.recent_accounts_list(clampInt(limit, 1, MAX_LIMIT, 10))
    },

    async recent_account_touch(account) {
      if (typeof account !== 'string' || account.length === 0) {
        throw new LedgerInputError(['account must be a non-empty string.'])
      }
      return stub.recent_account_touch(account)
    },

    async list_account_entries(account, limit = DEFAULT_LIMIT, offset = 0) {
      if (typeof account !== 'string' || account.length === 0) {
        throw new LedgerInputError(['account must be a non-empty string.'])
      }
      const l = clampInt(limit, 1, MAX_LIMIT, DEFAULT_LIMIT)
      const o = Math.max(0, Number.isFinite(offset) ? Math.floor(offset) : 0)
      return stub.list_account_entries(account, l, o)
    },

    async journal_get() {
      return stub.journal_get()
    },

    async journal_put(text) {
      if (typeof text !== 'string') {
        throw new LedgerInputError(['text must be a string.'])
      }
      return stub.journal_put(text)
    },

    async clear() {
      return stub.clear()
    },
  }
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.floor(n), min), max)
}
