export interface LedgerRow {
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

export interface PublicTransaction {
  id: number
  raw_text: string
  created_at: number
  updated_at: number
}

export function toPublicTransaction(row: LedgerRow): PublicTransaction {
  return {
    id: row.id,
    raw_text: row.raw_text,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
