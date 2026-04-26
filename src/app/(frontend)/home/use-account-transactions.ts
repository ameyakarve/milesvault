'use client'

import type { Transaction } from '@/durable/ledger-types'
import { useFetch } from './use-fetch'

export function useAccountTransactions(account: string | null, limit = 50) {
  const url = account
    ? `/api/ledger/transactions?q=${encodeURIComponent('@' + account)}&limit=${limit}&offset=0`
    : null
  return useFetch<{ rows: Transaction[]; total: number }>(url)
}
