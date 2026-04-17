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
