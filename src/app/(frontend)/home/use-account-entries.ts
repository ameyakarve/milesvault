'use client'

import type { AccountEntriesResponse } from '@/durable/ledger-types'
import { useFetch } from './use-fetch'

export function useAccountEntries(account: string, limit = 50) {
  const segments = account.split(':').map(encodeURIComponent).join('/')
  const url = `/api/ledger/accounts/${segments}/entries?limit=${limit}&offset=0`
  return useFetch<AccountEntriesResponse>(url)
}
