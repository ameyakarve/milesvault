import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'
import type { EntryKind } from '@/durable/ledger-do'

export const dynamic = 'force-dynamic'

const KINDS = new Set<EntryKind>([
  'txn',
  'open',
  'close',
  'commodity',
  'balance',
  'price',
  'note',
  'document',
  'event',
])

// GET /api/ledger/entries/get?kind=txn&id=42 — one existing entry's full text +
// OCC version. Backs the diff card (before-text) and the selection list.
export const GET = withLedger(async ({ client, req }) => {
  const q = req.nextUrl.searchParams
  const kind = q.get('kind') as EntryKind | null
  const id = Number(q.get('id'))
  if (!kind || !KINDS.has(kind) || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'kind and positive integer id required' }, { status: 400 })
  }
  const entry = await client.get_entry({ kind, id })
  if (!entry) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(entry)
})
