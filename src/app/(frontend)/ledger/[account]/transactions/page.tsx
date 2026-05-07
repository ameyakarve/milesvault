import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import React from 'react'
import { PerAccountView } from '../../per-account-view'

// Same view as /ledger/[account]/. PerAccountView reads the pathname and
// opens the transactions modal when the URL ends with /transactions.
// Direct landing on this URL (refresh, shared link) renders the underlying
// page with the modal already open.
export default async function LedgerTransactionsPage({
  params,
}: {
  params: Promise<{ account: string }>
}) {
  const [{ account: encoded }, session] = await Promise.all([params, auth()])
  if (!session?.user) {
    redirect(`/login?callbackUrl=/ledger/${encoded}/transactions`)
  }
  const account = decodeURIComponent(encoded).replaceAll('.', ':')
  return <PerAccountView account={account} />
}
