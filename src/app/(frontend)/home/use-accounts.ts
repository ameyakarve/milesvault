'use client'

import { useFetch } from './use-fetch'

export function useAccounts() {
  return useFetch<{ accounts: string[] }>('/api/ledger/v2/accounts')
}
