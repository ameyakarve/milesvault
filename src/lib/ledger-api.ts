import { getCloudflareContext } from '@opennextjs/cloudflare'
import type {
  JournalGetResponse,
  JournalPutError,
  JournalPutResponse,
  LedgerDO,
  PreviewJournalPutResponse,
} from '@/durable/ledger-do'
import type { AccountEntriesResponse, AccountSummaryRow } from '@/durable/ledger-types'
export const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export type LedgerClient = {
  list_account_entries(
    account: string,
    limit?: number,
    offset?: number,
  ): Promise<AccountEntriesResponse>
  journal_get(): Promise<JournalGetResponse>
  journal_get_for_account(account: string): Promise<JournalGetResponse>
  journal_get_for_account_currency(
    account: string,
    currency: string,
  ): Promise<JournalGetResponse>
  list_account_currencies(account: string): Promise<string[]>
  list_account_children(account: string): Promise<string[]>
  list_account_summaries(asOf: string): Promise<AccountSummaryRow[]>
  journal_put(text: string): Promise<JournalPutResponse | JournalPutError>
  preview_journal_put(
    text: string,
  ): Promise<PreviewJournalPutResponse | JournalPutError>
  clear(): Promise<{ ok: true }>
  record_attachment(opts: {
    r2_key: string
    sha256: string
    filename: string
    mime: string
    size: number
  }): Promise<{ ok: true; uploaded_at: number }>
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

    async journal_get_for_account(account) {
      if (typeof account !== 'string' || account.length === 0) {
        throw new LedgerInputError(['account must be a non-empty string.'])
      }
      return stub.journal_get_for_account(account)
    },

    async journal_get_for_account_currency(account, currency) {
      if (typeof account !== 'string' || account.length === 0) {
        throw new LedgerInputError(['account must be a non-empty string.'])
      }
      if (typeof currency !== 'string' || currency.length === 0) {
        throw new LedgerInputError(['currency must be a non-empty string.'])
      }
      return stub.journal_get_for_account_currency(account, currency)
    },

    async list_account_currencies(account) {
      if (typeof account !== 'string' || account.length === 0) {
        throw new LedgerInputError(['account must be a non-empty string.'])
      }
      return stub.list_account_currencies(account)
    },

    async list_account_children(account) {
      if (typeof account !== 'string' || account.length === 0) {
        throw new LedgerInputError(['account must be a non-empty string.'])
      }
      return stub.list_account_children(account)
    },

    async list_account_summaries(asOf) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
        throw new LedgerInputError(['as_of must be YYYY-MM-DD.'])
      }
      const asOfInt = Number(asOf.replaceAll('-', ''))
      return stub.list_account_summaries(asOfInt)
    },

    async journal_put(text) {
      if (typeof text !== 'string') {
        throw new LedgerInputError(['text must be a string.'])
      }
      return stub.journal_put(text)
    },

    async preview_journal_put(text) {
      if (typeof text !== 'string') {
        throw new LedgerInputError(['text must be a string.'])
      }
      return stub.preview_journal_put(text)
    },

    async clear() {
      return stub.clear()
    },

    async record_attachment(opts) {
      if (!opts || typeof opts.r2_key !== 'string' || opts.r2_key.length === 0) {
        throw new LedgerInputError(['r2_key must be a non-empty string.'])
      }
      if (typeof opts.sha256 !== 'string' || opts.sha256.length === 0) {
        throw new LedgerInputError(['sha256 must be a non-empty string.'])
      }
      if (typeof opts.filename !== 'string' || opts.filename.length === 0) {
        throw new LedgerInputError(['filename must be a non-empty string.'])
      }
      if (typeof opts.mime !== 'string' || opts.mime.length === 0) {
        throw new LedgerInputError(['mime must be a non-empty string.'])
      }
      if (!Number.isFinite(opts.size) || opts.size < 0) {
        throw new LedgerInputError(['size must be a non-negative number.'])
      }
      return stub.record_attachment(opts)
    },
  }
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.floor(n), min), max)
}
