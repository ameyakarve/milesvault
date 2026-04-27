import { DurableObject } from 'cloudflare:workers'
import { SCHEMA_STEPS } from '@/lib/ledger-core/schema'
import { dateFromInt } from '@/lib/beancount/ast'
import type {
  AccountEntriesResponse,
  Entry,
  EntryBalance,
  EntryClose,
  EntryDocument,
  EntryNote,
  EntryOpen,
  EntryPad,
  EntryTxn,
  Posting,
} from './ledger-types'

type EntryRef = { kind: Entry['kind']; id: number; date: number }

export class LedgerDO extends DurableObject<CloudflareEnv> {
  private sql: SqlStorage

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    super(state, env)
    this.sql = state.storage.sql
    this.migrate()
  }

  private migrate(): void {
    for (const step of SCHEMA_STEPS) {
      try {
        this.sql.exec(step.sql)
      } catch (e) {
        if (step.allowFail) continue
        console.error(`[migrate] step ${step.label} failed`, { err: String(e) })
        throw e
      }
    }
  }

  async recent_accounts_list(limit: number): Promise<string[]> {
    const recents = this.sql
      .exec<{ account: string }>(
        `SELECT account FROM account_recents
         ORDER BY last_viewed_at DESC
         LIMIT ?`,
        limit,
      )
      .toArray()
      .map((r) => r.account)
    if (recents.length > 0) return recents
    return this.sql
      .exec<{ account: string }>(
        `SELECT account FROM postings
         WHERE account != ''
         GROUP BY account
         ORDER BY COUNT(*) DESC
         LIMIT 3`,
      )
      .toArray()
      .map((r) => r.account)
  }

  async recent_account_touch(account: string): Promise<void> {
    this.sql.exec(
      `INSERT INTO account_recents (account, last_viewed_at) VALUES (?, ?)
       ON CONFLICT(account) DO UPDATE SET last_viewed_at = excluded.last_viewed_at`,
      account,
      Date.now(),
    )
  }

  async list_account_entries(
    account: string,
    limit: number,
    offset: number,
  ): Promise<AccountEntriesResponse> {
    const totalRow = this.sql
      .exec<{ c: number }>(
        `SELECT
          (SELECT COUNT(*) FROM transactions t
             WHERE t.id IN (SELECT p.txn_id FROM postings p WHERE p.account = ?))
        + (SELECT COUNT(*) FROM directives_open WHERE account = ?)
        + (SELECT COUNT(*) FROM directives_close WHERE account = ?)
        + (SELECT COUNT(*) FROM directives_balance WHERE account = ?)
        + (SELECT COUNT(*) FROM directives_pad WHERE account = ? OR account_pad = ?)
        + (SELECT COUNT(*) FROM directives_note WHERE account = ?)
        + (SELECT COUNT(*) FROM directives_document WHERE account = ?)
        AS c`,
        account,
        account,
        account,
        account,
        account,
        account,
        account,
        account,
      )
      .toArray()[0]
    const total = totalRow?.c ?? 0

    const refs = this.sql
      .exec<{ date: number; kind: string; id: number }>(
        `SELECT date, kind, id FROM (
           SELECT t.date AS date, 'txn' AS kind, t.id AS id
             FROM transactions t
             WHERE t.id IN (SELECT p.txn_id FROM postings p WHERE p.account = ?)
           UNION ALL
           SELECT date, 'open' AS kind, id FROM directives_open WHERE account = ?
           UNION ALL
           SELECT date, 'close' AS kind, id FROM directives_close WHERE account = ?
           UNION ALL
           SELECT date, 'balance' AS kind, id FROM directives_balance WHERE account = ?
           UNION ALL
           SELECT date, 'pad' AS kind, id FROM directives_pad
             WHERE account = ? OR account_pad = ?
           UNION ALL
           SELECT date, 'note' AS kind, id FROM directives_note WHERE account = ?
           UNION ALL
           SELECT date, 'document' AS kind, id FROM directives_document WHERE account = ?
         )
         ORDER BY date DESC, kind ASC, id DESC
         LIMIT ? OFFSET ?`,
        account,
        account,
        account,
        account,
        account,
        account,
        account,
        account,
        limit,
        offset,
      )
      .toArray()
      .map((r) => ({ kind: r.kind as Entry['kind'], id: r.id, date: r.date }))

    const entries: Entry[] = []
    for (const ref of refs) {
      const e = this.readEntry(ref)
      if (e) entries.push(e)
    }
    return { entries, total, limit, offset }
  }

  private readEntry(ref: EntryRef): Entry | null {
    switch (ref.kind) {
      case 'txn':
        return this.readTxnEntry(ref.id)
      case 'open':
        return this.readOpenEntry(ref.id)
      case 'close':
        return this.readCloseEntry(ref.id)
      case 'balance':
        return this.readBalanceEntry(ref.id)
      case 'pad':
        return this.readPadEntry(ref.id)
      case 'note':
        return this.readNoteEntry(ref.id)
      case 'document':
        return this.readDocumentEntry(ref.id)
    }
  }

  private readTxnEntry(id: number): EntryTxn | null {
    const head = this.sql
      .exec<{
        id: number
        date: number
        flag: string | null
        payee: string
        narration: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, flag, payee, narration, meta_json, created_at, updated_at
         FROM transactions WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!head) return null
    const postingRows = this.sql
      .exec<{
        idx: number
        flag: string | null
        account: string
        amount: string | null
        currency: string | null
        cost_raw: string | null
        price_at_signs: number
        price_amount: string | null
        price_currency: string | null
        comment: string | null
        meta_json: string
      }>(
        `SELECT idx, flag, account, amount, currency, cost_raw,
                price_at_signs, price_amount, price_currency, comment, meta_json
         FROM postings WHERE txn_id = ? ORDER BY idx ASC`,
        id,
      )
      .toArray()
    const postings: Posting[] = postingRows.map((r) => ({
      account: r.account,
      flag: r.flag,
      amount: r.amount,
      currency: r.currency,
      cost_raw: r.cost_raw,
      price_at_signs: (r.price_at_signs === 1 || r.price_at_signs === 2 ? r.price_at_signs : 0) as
        | 0
        | 1
        | 2,
      price_amount: r.price_amount,
      price_currency: r.price_currency,
      comment: r.comment,
      meta: parseMeta(r.meta_json),
    }))
    const tags = this.sql
      .exec<{ tag: string }>(
        'SELECT tag FROM txn_tags WHERE txn_id = ? ORDER BY tag ASC',
        id,
      )
      .toArray()
      .map((r) => r.tag)
    const links = this.sql
      .exec<{ link: string }>(
        'SELECT link FROM txn_links WHERE txn_id = ? ORDER BY link ASC',
        id,
      )
      .toArray()
      .map((r) => r.link)
    return {
      kind: 'txn',
      id: head.id,
      date: dateFromInt(head.date),
      flag: (head.flag === '*' || head.flag === '!' ? head.flag : null) as '*' | '!' | null,
      payee: head.payee,
      narration: head.narration,
      postings,
      tags,
      links,
      meta: parseMeta(head.meta_json),
      created_at: head.created_at,
      updated_at: head.updated_at,
    }
  }

  private readOpenEntry(id: number): EntryOpen | null {
    const row = this.sql
      .exec<{
        id: number
        date: number
        account: string
        booking_method: string | null
        constraint_currencies: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, booking_method, constraint_currencies,
                meta_json, created_at, updated_at
         FROM directives_open WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    return {
      kind: 'open',
      id: row.id,
      date: dateFromInt(row.date),
      account: row.account,
      booking_method: row.booking_method,
      constraint_currencies: parseStringArray(row.constraint_currencies),
      meta: parseMeta(row.meta_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  private readCloseEntry(id: number): EntryClose | null {
    const row = this.sql
      .exec<{
        id: number
        date: number
        account: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, meta_json, created_at, updated_at
         FROM directives_close WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    return {
      kind: 'close',
      id: row.id,
      date: dateFromInt(row.date),
      account: row.account,
      meta: parseMeta(row.meta_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  private readBalanceEntry(id: number): EntryBalance | null {
    const row = this.sql
      .exec<{
        id: number
        date: number
        account: string
        amount: string
        currency: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, amount, currency, meta_json, created_at, updated_at
         FROM directives_balance WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    return {
      kind: 'balance',
      id: row.id,
      date: dateFromInt(row.date),
      account: row.account,
      amount: row.amount,
      currency: row.currency,
      meta: parseMeta(row.meta_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  private readPadEntry(id: number): EntryPad | null {
    const row = this.sql
      .exec<{
        id: number
        date: number
        account: string
        account_pad: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, account_pad, meta_json, created_at, updated_at
         FROM directives_pad WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    return {
      kind: 'pad',
      id: row.id,
      date: dateFromInt(row.date),
      account: row.account,
      account_pad: row.account_pad,
      meta: parseMeta(row.meta_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  private readNoteEntry(id: number): EntryNote | null {
    const row = this.sql
      .exec<{
        id: number
        date: number
        account: string
        description: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, description, meta_json, created_at, updated_at
         FROM directives_note WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    return {
      kind: 'note',
      id: row.id,
      date: dateFromInt(row.date),
      account: row.account,
      description: row.description,
      meta: parseMeta(row.meta_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  private readDocumentEntry(id: number): EntryDocument | null {
    const row = this.sql
      .exec<{
        id: number
        date: number
        account: string
        filename: string
        meta_json: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, account, filename, meta_json, created_at, updated_at
         FROM directives_document WHERE id = ?`,
        id,
      )
      .toArray()[0]
    if (!row) return null
    return {
      kind: 'document',
      id: row.id,
      date: dateFromInt(row.date),
      account: row.account,
      filename: row.filename,
      meta: parseMeta(row.meta_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}

function parseMeta(json: string): Record<string, string> {
  if (json === '{}' || json === '') return {}
  try {
    const parsed = JSON.parse(json) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v
      }
      return out
    }
  } catch {}
  return {}
}

function parseStringArray(json: string): string[] {
  if (json === '[]' || json === '') return []
  try {
    const parsed = JSON.parse(json) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === 'string')
    }
  } catch {}
  return []
}
