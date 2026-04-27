'use client'

import { useCallback, useState } from 'react'
import { ledgerClient } from '@/lib/ledger-client-browser'
import { useFetch } from './use-fetch'

export function useRecentAccounts(limit = 10, enabled = true) {
  const [version, setVersion] = useState(0)
  const query = useFetch<{ accounts: string[] }>(
    enabled ? `/api/ledger/accounts/recent?limit=${limit}` : null,
    [version],
  )
  const touch = useCallback(async (account: string) => {
    await ledgerClient.recentAccountTouch(account)
    setVersion((v) => v + 1)
  }, [])
  return { ...query, touch }
}
