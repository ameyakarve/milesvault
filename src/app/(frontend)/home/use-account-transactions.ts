'use client'

import type { TransactionV2 } from '@/durable/ledger-v2-types'
import { useFetch } from './use-fetch'

export function useAccountTransactions(account: string | null, limit = 50) {
  const url = account
    ? `/api/ledger/v2/accounts/${encodeURIComponent(account)}/transactions?limit=${limit}&offset=0`
    : null
  return useFetch<{ rows: TransactionV2[]; total: number }>(url)
}
