'use client'

import { useCallback, useState } from 'react'
import { useFetch } from './use-fetch'

export function useRecentAccounts(limit = 10) {
  const [version, setVersion] = useState(0)
  const query = useFetch<{ accounts: string[] }>(
    `/api/ledger/v2/accounts/recent?limit=${limit}`,
    [version],
  )
  const touch = useCallback(async (account: string) => {
    await fetch('/api/ledger/v2/accounts/recent', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account }),
    })
    setVersion((v) => v + 1)
  }, [])
  return { ...query, touch }
}
