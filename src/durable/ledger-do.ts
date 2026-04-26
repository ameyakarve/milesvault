import { DurableObject } from 'cloudflare:workers'
import { extractTxn, splitEntries, type ExtractedTxn } from '@/lib/beancount/extract'
import { SCHEMA_STEPS } from '@/lib/ledger-core/schema'
import { SCHEMA_STEPS_V2 } from '@/lib/ledger-core/schema-v2'
import { ROW_COLS, buildSearchWhere } from '@/lib/ledger-core/queries'
import { distinctAccountsFromRawTexts } from '@/lib/ledger-core/accounts'
import {
  buildTransactionAst,
  serializeTransaction,
  validateInput,
} from '@/lib/beancount/v2-ast'
import type {
  Posting as PostingV2,
  PostingInput,
  TransactionInput,
  TransactionV2,
  V2CreateResult,
  V2DeleteResult,
  V2ListResult,
  V2UpdateResult,
} from './ledger-v2-types'
import type {
  TransactionRow,
  BatchApplyInput,
  BatchApplyResult,
  BatchValidationError,
  BatchConflict,
  ReplaceBufferInput,
  ReplaceBufferResult,
  ReplaceBufferConflict,
} from './ledger-types'
import type { SearchFilter } from './search-parser'

type BatchError = { index: number; errors: string[] }

export class LedgerDO extends DurableObject<CloudflareEnv> {
  private sql: SqlStorage

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    super(state, env)
    this.sql = state.storage.sql
    this.migrate()
  }

  private migrate(): void {
    const cols = this.sql
      .exec<{ name: string }>("SELECT name FROM pragma_table_info('transactions')")
      .toArray()
      .map((r) => r.name)
    if (cols.length > 0 && !cols.includes('date')) {
      console.warn('[migrate] transactions table missing `date` column — dropping to rebuild', {
        cols,
      })
      this.sql.exec('DROP TABLE IF EXISTS transactions_fts')
      this.sql.exec('DROP TABLE IF EXISTS transactions')
    }
    for (const [label, sql] of SCHEMA_STEPS) {
      try {
        this.sql.exec(sql)
      } catch (e) {
        console.error(`[migrate] step ${label} failed`, { err: String(e) })
        throw e
      }
    }
    for (const [label, sql] of SCHEMA_STEPS_V2) {
      try {
        this.sql.exec(sql)
      } catch (e) {
        console.error(`[migrate] v2 step ${label} failed`, { err: String(e) })
        throw e
      }
    }
  }

  async listAccounts(): Promise<string[]> {
    const rows = this.sql
      .exec<{ raw_text: string }>('SELECT raw_text FROM transactions')
      .toArray()
    return distinctAccountsFromRawTexts(rows.map((r) => r.raw_text))
  }

  async get(id: number): Promise<TransactionRow | null> {
    const row = this.sql
      .exec<TransactionRow>(
        `SELECT ${ROW_COLS} FROM transactions WHERE id = ?`,
        id,
      )
      .toArray()[0]
    return row ?? null
  }

  async search(
    filter: SearchFilter,
    limit: number,
    offset: number,
  ): Promise<{ rows: TransactionRow[]; total: number }> {
    const { whereSql, params } = buildSearchWhere(filter)
    const sqlParams = params as SqlStorageValue[]
    const total =
      this.sql
        .exec<{ c: number }>(
          `SELECT COUNT(*) AS c FROM transactions t ${whereSql}`,
          ...sqlParams,
        )
        .toArray()[0]?.c ?? 0
    const rows = this.sql
      .exec<TransactionRow>(
        `SELECT ${ROW_COLS} FROM transactions t
         ${whereSql}
         ORDER BY t.date DESC, t.id DESC
         LIMIT ? OFFSET ?`,
        ...sqlParams,
        limit,
        offset,
      )
      .toArray()
    return { rows, total }
  }

  async create(
    raw_text: string,
  ): Promise<{ ok: true; row: TransactionRow } | { ok: false; errors: string[] }> {
    const trimmed = raw_text.trim()
    if (trimmed.length === 0) return { ok: false, errors: ['Empty input.'] }
    const result = extractTxn(trimmed)
    if (result.ok !== true) {
      return { ok: false, errors: result.diagnostics.map((d) => d.message) }
    }
    const { date, flag, t_payee, t_account, t_currency, t_tag, t_link } = result.value
    const now = Date.now()
    const row = this.sql
      .exec<TransactionRow>(
        `INSERT INTO transactions
           (raw_text, date, flag, t_payee, t_account, t_currency, t_tag, t_link, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING ${ROW_COLS}`,
        trimmed,
        date,
        flag,
        t_payee,
        t_account,
        t_currency,
        t_tag,
        t_link,
        now,
        now,
      )
      .toArray()[0]
    return row ? { ok: true, row } : { ok: false, errors: ['Insert failed.'] }
  }

  async createBatch(
    raw_texts: string[],
  ): Promise<
    { ok: true; rows: TransactionRow[] } | { ok: false; errors: BatchError[] }
  > {
    const validated: { trimmed: string; extracted: ExtractedTxn }[] = []
    const errors: BatchError[] = []
    for (let i = 0; i < raw_texts.length; i++) {
      const trimmed = raw_texts[i].trim()
      if (trimmed.length === 0) {
        errors.push({ index: i, errors: ['Empty input.'] })
        continue
      }
      const result = extractTxn(trimmed)
      if (result.ok !== true) {
        errors.push({ index: i, errors: result.diagnostics.map((d) => d.message) })
        continue
      }
      validated.push({ trimmed, extracted: result.value })
    }
    if (errors.length > 0) return { ok: false, errors }

    const rows: TransactionRow[] = []
    this.ctx.storage.transactionSync(() => {
      const now = Date.now()
      for (const { trimmed, extracted } of validated) {
        const { date, flag, t_payee, t_account, t_currency, t_tag, t_link } = extracted
        const row = this.sql
          .exec<TransactionRow>(
            `INSERT INTO transactions
               (raw_text, date, flag, t_payee, t_account, t_currency, t_tag, t_link, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING ${ROW_COLS}`,
            trimmed,
            date,
            flag,
            t_payee,
            t_account,
            t_currency,
            t_tag,
            t_link,
            now,
            now,
          )
          .toArray()[0]
        if (row) rows.push(row)
      }
    })
    return { ok: true, rows }
  }

  async applyBatch(input: BatchApplyInput): Promise<BatchApplyResult> {
    const updates = input.updates ?? []
    const creates = input.creates ?? []
    const deletes = input.deletes ?? []

    const seenIds = new Set<number>()
    const requestErrors: string[] = []
    for (const u of updates) {
      if (seenIds.has(u.id)) requestErrors.push(`Duplicate id ${u.id} in updates/deletes.`)
      seenIds.add(u.id)
    }
    for (const d of deletes) {
      if (seenIds.has(d.id)) requestErrors.push(`Duplicate id ${d.id} in updates/deletes.`)
      seenIds.add(d.id)
    }
    if (requestErrors.length > 0) {
      return {
        ok: false,
        kind: 'validation',
        errors: [{ section: 'request', index: -1, errors: requestErrors }],
      }
    }

    const validationErrors: BatchValidationError[] = []
    const parsedUpdates: {
      id: number
      expected_updated_at: number
      trimmed: string
      extracted: ExtractedTxn
    }[] = []
    const parsedCreates: { trimmed: string; extracted: ExtractedTxn }[] = []

    for (let i = 0; i < updates.length; i++) {
      const u = updates[i]
      const trimmed = u.raw_text.trim()
      if (trimmed.length === 0) {
        validationErrors.push({ section: 'updates', index: i, errors: ['Empty input.'] })
        continue
      }
      const result = extractTxn(trimmed)
      if (result.ok !== true) {
        validationErrors.push({
          section: 'updates',
          index: i,
          errors: result.diagnostics.map((d) => d.message),
        })
        continue
      }
      parsedUpdates.push({
        id: u.id,
        expected_updated_at: u.expected_updated_at,
        trimmed,
        extracted: result.value,
      })
    }
    for (let i = 0; i < creates.length; i++) {
      const c = creates[i]
      const trimmed = c.raw_text.trim()
      if (trimmed.length === 0) {
        validationErrors.push({ section: 'creates', index: i, errors: ['Empty input.'] })
        continue
      }
      const result = extractTxn(trimmed)
      if (result.ok !== true) {
        validationErrors.push({
          section: 'creates',
          index: i,
          errors: result.diagnostics.map((d) => d.message),
        })
        continue
      }
      parsedCreates.push({ trimmed, extracted: result.value })
    }
    if (validationErrors.length > 0) {
      return { ok: false, kind: 'validation', errors: validationErrors }
    }

    const conflicts: BatchConflict[] = []
    for (let i = 0; i < parsedUpdates.length; i++) {
      const u = parsedUpdates[i]
      const current = this.sql
        .exec<{ updated_at: number }>(
          'SELECT updated_at FROM transactions WHERE id = ?',
          u.id,
        )
        .toArray()[0]
      if (!current || current.updated_at !== u.expected_updated_at) {
        conflicts.push({
          section: 'updates',
          index: i,
          id: u.id,
          expected_updated_at: u.expected_updated_at,
          current_updated_at: current?.updated_at ?? null,
        })
      }
    }
    for (let i = 0; i < deletes.length; i++) {
      const d = deletes[i]
      const current = this.sql
        .exec<{ updated_at: number }>(
          'SELECT updated_at FROM transactions WHERE id = ?',
          d.id,
        )
        .toArray()[0]
      if (!current || current.updated_at !== d.expected_updated_at) {
        conflicts.push({
          section: 'deletes',
          index: i,
          id: d.id,
          expected_updated_at: d.expected_updated_at,
          current_updated_at: current?.updated_at ?? null,
        })
      }
    }
    if (conflicts.length > 0) {
      console.warn(
        `[ledger-do] applyBatch conflict n=${conflicts.length} sections=${conflicts.map((c) => `${c.section}:${c.id}`).join(',')}`,
      )
      return { ok: false, kind: 'conflict', conflicts }
    }

    const updated: TransactionRow[] = []
    const created: TransactionRow[] = []
    const deleted: number[] = []

    this.ctx.storage.transactionSync(() => {
      const now = Date.now()
      for (const d of deletes) {
        const row = this.sql
          .exec<{ id: number }>('DELETE FROM transactions WHERE id = ? RETURNING id', d.id)
          .toArray()[0]
        if (row) deleted.push(row.id)
      }
      for (const u of parsedUpdates) {
        const { date, flag, t_payee, t_account, t_currency, t_tag, t_link } = u.extracted
        const row = this.sql
          .exec<TransactionRow>(
            `UPDATE transactions SET
               raw_text = ?, date = ?, flag = ?,
               t_payee = ?, t_account = ?, t_currency = ?, t_tag = ?, t_link = ?,
               updated_at = max(?, updated_at + 1)
             WHERE id = ?
             RETURNING ${ROW_COLS}`,
            u.trimmed,
            date,
            flag,
            t_payee,
            t_account,
            t_currency,
            t_tag,
            t_link,
            now,
            u.id,
          )
          .toArray()[0]
        if (row) updated.push(row)
      }
      for (const c of parsedCreates) {
        const { date, flag, t_payee, t_account, t_currency, t_tag, t_link } = c.extracted
        const row = this.sql
          .exec<TransactionRow>(
            `INSERT INTO transactions
               (raw_text, date, flag, t_payee, t_account, t_currency, t_tag, t_link, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING ${ROW_COLS}`,
            c.trimmed,
            date,
            flag,
            t_payee,
            t_account,
            t_currency,
            t_tag,
            t_link,
            now,
            now,
          )
          .toArray()[0]
        if (row) created.push(row)
      }
    })

    console.log(
      `[ledger-do] applyBatch ok updated=${updated.length} created=${created.length} deleted=${deleted.length}`,
    )
    return { ok: true, updated, created, deleted }
  }

  async replaceBuffer(input: ReplaceBufferInput): Promise<ReplaceBufferResult> {
    const conflicts: ReplaceBufferConflict[] = []
    for (const k of input.knownIds) {
      const current = this.sql
        .exec<{ updated_at: number }>(
          'SELECT updated_at FROM transactions WHERE id = ?',
          k.id,
        )
        .toArray()[0]
      if (!current || current.updated_at !== k.expected_updated_at) {
        conflicts.push({
          id: k.id,
          expected_updated_at: k.expected_updated_at,
          current_updated_at: current?.updated_at ?? null,
        })
      }
    }
    if (conflicts.length > 0) {
      console.warn(
        `[ledger-do] replaceBuffer conflict n=${conflicts.length} ids=${conflicts.map((c) => c.id).join(',')}`,
      )
      return { ok: false, kind: 'conflict', conflicts }
    }

    const entries = splitEntries(input.buffer)
      .map((e) => e.text.trim())
      .filter((s) => s.length > 0)

    const rows: TransactionRow[] = []
    this.ctx.storage.transactionSync(() => {
      const now = Date.now()
      for (const k of input.knownIds) {
        this.sql.exec('DELETE FROM transactions WHERE id = ?', k.id)
      }
      for (const entry of entries) {
        const parsed = extractTxn(entry)
        const cols: ExtractedTxn =
          parsed.ok === true
            ? parsed.value
            : {
                date: 0,
                flag: null,
                t_payee: '',
                t_account: '',
                t_currency: '',
                t_tag: '',
                t_link: '',
              }
        const row = this.sql
          .exec<TransactionRow>(
            `INSERT INTO transactions
               (raw_text, date, flag, t_payee, t_account, t_currency, t_tag, t_link, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING ${ROW_COLS}`,
            entry,
            cols.date,
            cols.flag,
            cols.t_payee,
            cols.t_account,
            cols.t_currency,
            cols.t_tag,
            cols.t_link,
            now,
            now,
          )
          .toArray()[0]
        if (row) rows.push(row)
      }
    })
    rows.sort((a, b) => b.date - a.date || b.id - a.id)
    console.log(
      `[ledger-do] replaceBuffer ok entries=${entries.length} replaced=${input.knownIds.length}`,
    )
    return { ok: true, rows }
  }

  async update(_id: number, _raw_text: string): Promise<TransactionRow | null> {
    return null
  }

  async remove(id: number): Promise<boolean> {
    const deleted = this.sql
      .exec<{ id: number }>('DELETE FROM transactions WHERE id = ? RETURNING id', id)
      .toArray()
    return deleted.length > 0
  }

  async exportAll(): Promise<TransactionRow[]> {
    return []
  }

  async importAll(_rows: TransactionRow[]): Promise<{ copied: number }> {
    return { copied: 0 }
  }

  async v2_create(input: TransactionInput): Promise<V2CreateResult> {
    const prepared = prepareV2Input(input)
    if (prepared.ok === false) return { ok: false, errors: prepared.errors }
    const rawText = prepared.rawText
    const now = Date.now()
    let txn: TransactionV2 | null = null
    this.ctx.storage.transactionSync(() => {
      const row = this.sql
        .exec<{ id: number }>(
          `INSERT INTO transactions_v2
             (date, flag, payee, narration, meta_json, raw_text, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
          input.date,
          input.flag ?? null,
          input.payee ?? '',
          input.narration ?? '',
          JSON.stringify(input.meta ?? {}),
          rawText,
          now,
          now,
        )
        .toArray()[0]
      if (!row) return
      this.insertV2Children(row.id, input)
      txn = this.readV2Transaction(row.id)
    })
    return txn ? { ok: true, transaction: txn } : { ok: false, errors: ['Insert failed.'] }
  }

  async v2_get(id: number): Promise<TransactionV2 | null> {
    return this.readV2Transaction(id)
  }

  async v2_list(limit: number, offset: number): Promise<V2ListResult> {
    const total =
      this.sql
        .exec<{ c: number }>('SELECT COUNT(*) AS c FROM transactions_v2')
        .toArray()[0]?.c ?? 0
    const ids = this.sql
      .exec<{ id: number }>(
        `SELECT id FROM transactions_v2
         ORDER BY date DESC, id DESC
         LIMIT ? OFFSET ?`,
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

  async v2_update(
    id: number,
    expected_updated_at: number,
    input: TransactionInput,
  ): Promise<V2UpdateResult> {
    const prepared = prepareV2Input(input)
    if (prepared.ok === false) {
      return { ok: false, kind: 'validation', errors: prepared.errors }
    }
    const rawText = prepared.rawText
    let result: V2UpdateResult = { ok: false, kind: 'not_found' }
    this.ctx.storage.transactionSync(() => {
      const current = this.sql
        .exec<{ updated_at: number }>(
          'SELECT updated_at FROM transactions_v2 WHERE id = ?',
          id,
        )
        .toArray()[0]
      if (!current) {
        result = { ok: false, kind: 'not_found' }
        return
      }
      if (current.updated_at !== expected_updated_at) {
        result = {
          ok: false,
          kind: 'conflict',
          current_updated_at: current.updated_at,
        }
        return
      }
      const now = Date.now()
      this.sql.exec(
        `UPDATE transactions_v2 SET
           date = ?, flag = ?, payee = ?, narration = ?, meta_json = ?,
           raw_text = ?, updated_at = max(?, updated_at + 1)
         WHERE id = ?`,
        input.date,
        input.flag ?? null,
        input.payee ?? '',
        input.narration ?? '',
        JSON.stringify(input.meta ?? {}),
        rawText,
        now,
        id,
      )
      this.sql.exec('DELETE FROM postings WHERE txn_id = ?', id)
      this.sql.exec('DELETE FROM txn_tags WHERE txn_id = ?', id)
      this.sql.exec('DELETE FROM txn_links WHERE txn_id = ?', id)
      this.insertV2Children(id, input)
      const txn = this.readV2Transaction(id)
      result = txn ? { ok: true, transaction: txn } : { ok: false, kind: 'not_found' }
    })
    return result
  }

  async v2_delete(id: number, expected_updated_at: number): Promise<V2DeleteResult> {
    let result: V2DeleteResult = { ok: false, kind: 'not_found' }
    this.ctx.storage.transactionSync(() => {
      const current = this.sql
        .exec<{ updated_at: number }>(
          'SELECT updated_at FROM transactions_v2 WHERE id = ?',
          id,
        )
        .toArray()[0]
      if (!current) {
        result = { ok: false, kind: 'not_found' }
        return
      }
      if (current.updated_at !== expected_updated_at) {
        result = {
          ok: false,
          kind: 'conflict',
          current_updated_at: current.updated_at,
        }
        return
      }
      this.sql.exec('DELETE FROM transactions_v2 WHERE id = ?', id)
      result = { ok: true }
    })
    return result
  }

  private insertV2Children(txnId: number, input: TransactionInput): void {
    for (let i = 0; i < input.postings.length; i++) {
      const p: PostingInput = input.postings[i]
      this.sql.exec(
        `INSERT INTO postings
           (txn_id, idx, flag, account, amount, currency, cost_raw,
            price_at_signs, price_amount, price_currency, comment, meta_json, date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        txnId,
        i,
        p.flag ?? null,
        p.account,
        p.amount ?? null,
        p.currency ?? null,
        p.cost_raw ?? null,
        p.price_at_signs ?? 0,
        p.price_amount ?? null,
        p.price_currency ?? null,
        p.comment ?? null,
        JSON.stringify(p.meta ?? {}),
        input.date,
      )
    }
    for (const tag of input.tags ?? []) {
      this.sql.exec(
        'INSERT OR IGNORE INTO txn_tags (txn_id, tag, from_stack) VALUES (?, ?, 0)',
        txnId,
        tag,
      )
    }
    for (const link of input.links ?? []) {
      this.sql.exec(
        'INSERT OR IGNORE INTO txn_links (txn_id, link) VALUES (?, ?)',
        txnId,
        link,
      )
    }
  }

  private readV2Transaction(id: number): TransactionV2 | null {
    const head = this.sql
      .exec<{
        id: number
        date: string
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
      date: head.date,
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

function prepareV2Input(
  input: TransactionInput,
): { ok: true; rawText: string } | { ok: false; errors: string[] } {
  const errors = validateInput(input)
  if (errors.length > 0) return { ok: false, errors }
  try {
    return { ok: true, rawText: serializeTransaction(buildTransactionAst(input)) }
  } catch (e) {
    return { ok: false, errors: [`serialize failed: ${String(e)}`] }
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
