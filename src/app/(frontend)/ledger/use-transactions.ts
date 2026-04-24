'use client'

import { useEffect, useState } from 'react'
import type { Transaction } from '@/durable/ledger-types'
import type { FetchStatus } from './ledger-panes'

export const PAGE_SIZE = 50

export type Snapshot = { id: number; raw_text: string; expected_updated_at: number }

export function buildSnapshots(rows: Transaction[]): Snapshot[] {
  return rows.map((r) => ({
    id: r.id,
    raw_text: r.raw_text.trim(),
    expected_updated_at: r.updated_at,
  }))
}

export type FetchState = {
  status: FetchStatus
  rows: Transaction[]
  total: number
  errorMsg: string | null
}

export function useTransactions(
  page: number,
): FetchState & { replaceRows: (rows: Transaction[]) => void } {
  const [state, setState] = useState<FetchState>({
    status: 'loading',
    rows: [],
    total: 0,
    errorMsg: null,
  })
  useEffect(() => {
    const controller = new AbortController()
    setState((prev) => ({ ...prev, status: 'loading', errorMsg: null }))
    const offset = (page - 1) * PAGE_SIZE
    fetch(`/api/ledger/transactions?q=&limit=${PAGE_SIZE}&offset=${offset}`, {
      signal: controller.signal,
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as { rows: Transaction[]; total: number }
      })
      .then((data) =>
        setState({ status: 'idle', rows: data.rows, total: data.total, errorMsg: null }),
      )
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setState({
          status: 'error',
          rows: [],
          total: 0,
          errorMsg: e instanceof Error ? e.message : String(e),
        })
      })
    return () => controller.abort()
  }, [page])
  return {
    ...state,
    replaceRows: (rows) =>
      setState((prev) => ({
        ...prev,
        rows,
        total: prev.total - prev.rows.length + rows.length,
      })),
  }
}
