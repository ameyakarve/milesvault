import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import React from 'react'
import { PerAccountView } from '../per-account-view'

export default async function LedgerPage({
  params,
}: {
  params: Promise<{ account: string }>
}) {
  const [{ account: encoded }, session] = await Promise.all([params, auth()])
  if (!session?.user) {
    redirect(`/login?callbackUrl=/ledger/${encoded}`)
  }
  // URLs use periods as the segment separator; the in-app account name uses
  // colons (Beancount native). Beancount disallows '.' in account names, so
  // the round-trip is lossless.
  const account = decodeURIComponent(encoded).replaceAll('.', ':')
  return <PerAccountView account={account} />
}
