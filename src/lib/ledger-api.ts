import { getCloudflareContext } from '@opennextjs/cloudflare'
import type {
  JournalGetFilteredRequest,
  JournalGetFilteredResponse,
  JournalGetResponse,
  LedgerDO,
  ListEntriesResponse,
  ReplaceBufferRequest,
  ReplaceBufferResponse,
  StatementRecord,
  SubmitStatementCardResponse,
} from '@/durable/ledger-do'
import type { AccountEntriesResponse, AccountSummaryRow } from '@/durable/ledger-types'
import type {
  PostingSearchFilter,
  PostingSearchResponse,
} from '@/lib/ledger-core/posting-search'
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
  journal_get_filtered(req: JournalGetFilteredRequest): Promise<JournalGetFilteredResponse>
  list_account_currencies(account: string): Promise<string[]>
  list_account_children(account: string): Promise<string[]>
  list_account_summaries(asOf: string): Promise<AccountSummaryRow[]>
  search_postings(filter: PostingSearchFilter): Promise<PostingSearchResponse>
  query_sql(
    sql: string,
    params?: ReadonlyArray<string | number | null>,
  ): Promise<{
    columns: string[]
    rows: Array<Record<string, unknown>>
    truncated: boolean
  }>
  exec_sql(
    sql: string,
    params?: ReadonlyArray<string | number | null>,
  ): Promise<{
    columns: string[]
    rows: Array<Record<string, unknown>>
    truncated: boolean
    rows_written: number
  }>
  list_entries(): Promise<ListEntriesResponse>
  replace_buffer(req: ReplaceBufferRequest): Promise<ReplaceBufferResponse>
  clear(): Promise<{ ok: true }>
  attach_statement(opts: { filename: string; text: string }): Promise<{ id: string }>
  get_statement(id: string): Promise<StatementRecord | null>
  submit_statement_card(opts: {
    id: string
    userText?: string
  }): Promise<SubmitStatementCardResponse>
  delete_statement(id: string): Promise<{ ok: true }>
  ledger_snapshot(): Promise<{
    today: number
    accounts: Array<{
      account: string
      currencies: string[]
      open_date: number
      close_date: number | null
    }>
    row_counts: Record<string, number>
    sample_txns: string
    schema_ddl: string
  }>
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

    async journal_get_filtered(req) {
      return stub.journal_get_filtered(req)
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

    async search_postings(filter) {
      return stub.search_postings(filter)
    },

    async query_sql(sql, params = []) {
      if (typeof sql !== 'string' || sql.length === 0) {
        throw new LedgerInputError(['sql must be a non-empty string.'])
      }
      return stub.query_sql(sql, params)
    },

    async exec_sql(sql, params = []) {
      if (typeof sql !== 'string' || sql.length === 0) {
        throw new LedgerInputError(['sql must be a non-empty string.'])
      }
      return stub.exec_sql(sql, params)
    },

    async list_entries() {
      return stub.listEntries()
    },

    async replace_buffer(req) {
      if (!Array.isArray(req.knownIds)) {
        throw new LedgerInputError(['knownIds must be an array.'])
      }
      for (const [idx, k] of req.knownIds.entries()) {
        if (!Number.isInteger(k.id) || k.id <= 0) {
          throw new LedgerInputError([
            `knownIds[${idx}].id must be a positive integer.`,
          ])
        }
        if (!Number.isInteger(k.expected_updated_at)) {
          throw new LedgerInputError([
            `knownIds[${idx}].expected_updated_at must be an integer.`,
          ])
        }
      }
      if (typeof req.buffer !== 'string') {
        throw new LedgerInputError(['buffer must be a string.'])
      }
      return stub.replaceBuffer(req)
    },

    async clear() {
      return stub.clear()
    },

    async attach_statement(opts) {
      if (typeof opts?.filename !== 'string' || opts.filename.length === 0) {
        throw new LedgerInputError(['filename must be a non-empty string.'])
      }
      if (typeof opts?.text !== 'string' || opts.text.length === 0) {
        throw new LedgerInputError(['text must be a non-empty string.'])
      }
      return stub.attach_statement(opts)
    },

    async get_statement(id) {
      if (typeof id !== 'string' || id.length === 0) {
        throw new LedgerInputError(['id must be a non-empty string.'])
      }
      return stub.get_statement(id)
    },

    async submit_statement_card(opts) {
      if (typeof opts?.id !== 'string' || opts.id.length === 0) {
        throw new LedgerInputError(['id must be a non-empty string.'])
      }
      return stub.submit_statement_card(opts)
    },

    async delete_statement(id) {
      if (typeof id !== 'string' || id.length === 0) {
        throw new LedgerInputError(['id must be a non-empty string.'])
      }
      return stub.delete_statement(id)
    },

    async ledger_snapshot() {
      return stub.ledger_snapshot()
    },
  }
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.floor(n), min), max)
}
