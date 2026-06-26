import { NextResponse } from 'next/server'
import { withLedger } from '@/lib/ledger-route-handler'

export const dynamic = 'force-dynamic'

// Vault-home hide control: which card/programme tiles the user has hidden. A
// pure display preference — it never touches balances, totals or the ledger.
export const GET = withLedger(async ({ client }) => {
  return NextResponse.json(await client.list_hidden_accounts())
})

// Toggle a tile's visibility: { account, action: 'hide' | 'show' }.
export const POST = withLedger(async ({ client, req }) => {
  let body: { account?: string; action?: string }
  try {
    body = (await req.json()) as { account?: string; action?: string }
  } catch {
    return new NextResponse('expected JSON body {account, action}', { status: 400 })
  }
  if (!body.account || !['hide', 'show'].includes(body.action ?? '')) {
    return new NextResponse('action must be hide|show, with an account', { status: 400 })
  }
  return NextResponse.json(await client.set_account_hidden(body.account, body.action === 'hide'))
})
