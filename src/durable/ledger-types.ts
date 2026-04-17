export interface TransactionRow extends Record<string, SqlStorageValue> {
  id: number
  raw_text: string
  date: number
  flag: string | null
  t_payee: string
  t_account: string
  t_currency: string
  t_tag: string
  t_link: string
  created_at: number
  updated_at: number
}

export interface Transaction {
  id: number
  raw_text: string
  created_at: number
  updated_at: number
}

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    raw_text: row.raw_text,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export type BatchUpdate = { id: number; raw_text: string; expected_updated_at: number }
export type BatchCreate = { raw_text: string }
export type BatchDelete = { id: number; expected_updated_at: number }

export type BatchApplyInput = {
  updates?: BatchUpdate[]
  creates?: BatchCreate[]
  deletes?: BatchDelete[]
}

export type BatchValidationError = {
  section: 'request' | 'updates' | 'creates'
  index: number
  errors: string[]
}

export type BatchConflict = {
  section: 'updates' | 'deletes'
  index: number
  id: number
  expected_updated_at: number
  current_updated_at: number | null
}

export type BatchApplyResult =
  | { ok: true; updated: TransactionRow[]; created: TransactionRow[]; deleted: number[] }
  | { ok: false; kind: 'validation'; errors: BatchValidationError[] }
  | { ok: false; kind: 'conflict'; conflicts: BatchConflict[] }
