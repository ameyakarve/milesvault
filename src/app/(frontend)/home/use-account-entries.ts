'use client'

import type { AccountEntriesResponse } from '@/durable/ledger-types'
import { useFetch } from './use-fetch'

export function useAccountEntries(account: string, limit = 50) {
  const url = `/api/ledger/accounts/${encodeURIComponent(account)}/entries?limit=${limit}&offset=0`
  return useFetch<AccountEntriesResponse>(url)
}
