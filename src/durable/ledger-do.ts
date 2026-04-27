import { DurableObject } from 'cloudflare:workers'
import { SCHEMA_STEPS_V2 } from '@/lib/ledger-core/schema-v2'
import type {
  Posting as PostingV2,
  TransactionV2,
  V2ListResult,
} from './ledger-v2-types'

export class LedgerDO extends DurableObject<CloudflareEnv> {
  private sql: SqlStorage

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    super(state, env)
    this.sql = state.storage.sql
    this.migrate()
  }

  private migrate(): void {
    for (const [label, sql] of SCHEMA_STEPS_V2) {
      try {
        this.sql.exec(sql)
      } catch (e) {
        console.error(`[migrate] v2 step ${label} failed`, { err: String(e) })
        throw e
      }
    }
  }

  async v2_recent_accounts_list(limit: number): Promise<string[]> {
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

  async v2_recent_account_touch(account: string): Promise<void> {
    this.sql.exec(
      `INSERT INTO account_recents (account, last_viewed_at) VALUES (?, ?)
       ON CONFLICT(account) DO UPDATE SET last_viewed_at = excluded.last_viewed_at`,
      account,
      Date.now(),
    )
  }

  async v2_list_by_account(
    account: string,
    limit: number,
    offset: number,
  ): Promise<V2ListResult> {
    const totalRow = this.sql
      .exec<{ c: number }>(
        `SELECT COUNT(*) AS c FROM transactions_v2 t
         WHERE t.id IN (SELECT p.txn_id FROM postings p WHERE p.account = ?)`,
        account,
      )
      .toArray()[0]
    const total = totalRow?.c ?? 0
    const ids = this.sql
      .exec<{ id: number }>(
        `SELECT t.id FROM transactions_v2 t
         WHERE t.id IN (SELECT p.txn_id FROM postings p WHERE p.account = ?)
         ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`,
        account,
        limit,
        offset,
      )
      .toArray()
      .map((r) => r.id)
    const rows: TransactionV2[] = []
    for (const id of ids) {
      const t = this.readV2Transaction(id)
      if (t) rows.push(t)
    }
    return { rows, total, limit, offset }
  }

  private readV2Transaction(id: number): TransactionV2 | null {
    const head = this.sql
      .exec<{
        id: number
        date: number
        flag: string | null
        payee: string
        narration: string
        meta_json: string
        raw_text: string
        created_at: number
        updated_at: number
      }>(
        `SELECT id, date, flag, payee, narration, meta_json, raw_text, created_at, updated_at
         FROM transactions_v2 WHERE id = ?`,
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
    const postings: PostingV2[] = postingRows.map((r) => ({
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
      id: head.id,
      date: dateFromInt(head.date),
      flag: (head.flag === '*' || head.flag === '!' ? head.flag : null) as '*' | '!' | null,
      payee: head.payee,
      narration: head.narration,
      postings,
      tags,
      links,
      meta: parseMeta(head.meta_json),
      raw_text: head.raw_text,
      created_at: head.created_at,
      updated_at: head.updated_at,
    }
  }
}

function dateFromInt(n: number): string {
  const s = String(n).padStart(8, '0')
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
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
