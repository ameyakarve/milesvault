import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import React from 'react'
import { AccountsDirectoryLoader } from './accounts-directory-loader'

export default async function LedgerIndexPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login?callbackUrl=/ledger')
  }
  const today = new Date().toISOString().slice(0, 10)
  return <AccountsDirectoryLoader initialAsOf={today} />
}
