import { getCloudflareContext } from '@opennextjs/cloudflare'
import type {
  JournalGetFilteredRequest,
  JournalGetFilteredResponse,
  JournalGetResponse,
  LedgerDO,
  ListEntriesResponse,
  ReplaceBufferRequest,
  ReplaceBufferResponse,
} from '@/durable/ledger-do'
import type { ChatDO } from '@/durable/chat-do'
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
  delete_capture(id: string): Promise<{ ok: boolean }>
  set_capture_state(
    id: string,
    state: 'captured' | 'extracted' | 'posted' | 'dismissed',
  ): Promise<{ ok: boolean }>
  list_captures(): Promise<{
    rows: Array<{
      id: string
      source: string
      artifact: string | null
      filename: string | null
      state: string
      prompt: string | null
      created_at: number
    }>
  }>
  list_email_rules(): ReturnType<LedgerDO['list_email_rules']>
  match_email_rule(headers: {
    from: string
    subject: string
  }): ReturnType<LedgerDO['match_email_rule']>
  list_ingest_log(): ReturnType<LedgerDO['list_ingest_log']>
  account_overview(
    opts: Parameters<LedgerDO['account_overview']>[0],
  ): ReturnType<LedgerDO['account_overview']>
  vault_stats(
    opts: Parameters<LedgerDO['vault_stats']>[0],
  ): ReturnType<LedgerDO['vault_stats']>
  save_email_rule(
    rule: Parameters<LedgerDO['save_email_rule']>[0],
  ): ReturnType<LedgerDO['save_email_rule']>
  delete_email_rule(id: number): ReturnType<LedgerDO['delete_email_rule']>
  replace_buffer(req: ReplaceBufferRequest): Promise<ReplaceBufferResponse>
  clear(): Promise<{ ok: true }>
  put_statement(opts: {
    id: string
    ownerEmail: string
    filename: string
    text: string
    capture?: boolean
  }): Promise<{ ok: true }>
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

    async list_captures() {
      return stub.list_captures()
    },

    async set_capture_state(id, state) {
      return stub.set_capture_state(id, state)
    },

    async list_email_rules() {
      return stub.list_email_rules()
    },

    async match_email_rule(headers) {
      return stub.match_email_rule(headers)
    },

    async list_ingest_log() {
      return stub.list_ingest_log()
    },

    async vault_stats(opts) {
      return stub.vault_stats(opts)
    },

    async account_overview(opts) {
      if (typeof opts.account !== 'string' || opts.account.length === 0) {
        throw new LedgerInputError(['account must be a non-empty string.'])
      }
      return stub.account_overview(opts)
    },

    async save_email_rule(rule) {
      return stub.save_email_rule(rule)
    },

    async delete_email_rule(id) {
      return stub.delete_email_rule(id)
    },

    async list_entries() {
      return stub.listEntries()
    },

    async delete_capture(id) {
      return stub.delete_capture(id)
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

    async put_statement(opts) {
      if (typeof opts.id !== 'string' || !opts.id.startsWith('STMT-')) {
        throw new LedgerInputError(['id must start with "STMT-".'])
      }
      return stub.put_statement(opts)
    },

    async ledger_snapshot() {
      return stub.ledger_snapshot()
    },
  }
}

// The chat/agent runtime lives in ChatDO (extends Think), keyed per-user just
// like LedgerDO. Only the reset-on-clear path needs a server-side handle.
export async function getChatClient(email: string): Promise<{
  reset_active_agent(): Promise<{ ok: true }>
  dump_messages(): Promise<unknown[]>
}> {
  const { env } = await getCloudflareContext({ async: true })
  const ns = (env as Cloudflare.Env).CHAT_DO as
    | DurableObjectNamespace<ChatDO>
    | undefined
  if (!ns) throw new Error('CHAT_DO binding missing')
  const stub = ns.get(ns.idFromName(email))
  return {
    async reset_active_agent() {
      return stub.reset_active_agent()
    },
    async dump_messages() {
      return stub.dump_messages()
    },
  }
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.floor(n), min), max)
}
