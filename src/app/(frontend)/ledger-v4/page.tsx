import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import React from 'react'
import { PerAccountView } from './per-account-view'

export default async function LedgerV4Page() {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/ledger-v4')
  return <PerAccountView />
}
