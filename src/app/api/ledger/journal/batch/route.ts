import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'
import type { EntryKind, EntryRef2 } from '@/durable/ledger-do'

export const dynamic = 'force-dynamic'

const KINDS: ReadonlySet<EntryKind> = new Set([
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

export const PUT = withLedger(async ({ client, req }) => {
  const body = (await req.json().catch((): null => null)) as
    | { knownIds?: unknown; buffer?: unknown }
    | null
  if (!body || typeof body.buffer !== 'string' || !Array.isArray(body.knownIds)) {
    return NextResponse.json(
      { errors: ['{knownIds: [...], buffer: string} required'] },
      { status: 400 },
    )
  }
  const knownIds: EntryRef2[] = []
  for (const raw of body.knownIds) {
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json(
        { errors: ['knownIds entries must be objects'] },
        { status: 400 },
      )
    }
    const r = raw as { kind?: unknown; id?: unknown; expected_updated_at?: unknown }
    if (
      typeof r.kind !== 'string' ||
      !KINDS.has(r.kind as EntryKind) ||
      typeof r.id !== 'number' ||
      typeof r.expected_updated_at !== 'number'
    ) {
      return NextResponse.json(
        {
          errors: [
            'each knownIds entry needs {kind: EntryKind, id: number, expected_updated_at: number}',
          ],
        },
        { status: 400 },
      )
    }
    knownIds.push({
      kind: r.kind as EntryKind,
      id: r.id,
      expected_updated_at: r.expected_updated_at,
    })
  }
  const result = await client.replace_buffer({ knownIds, buffer: body.buffer })
  if ('ok' in result && result.ok === false) {
    const status = result.error === 'occ_conflict' ? 409 : 400
    return NextResponse.json(result, { status })
  }
  return NextResponse.json(result)
})
